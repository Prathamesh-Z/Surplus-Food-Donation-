import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/auth.js';
import {
  registerUser,
  loginUser,
  refreshSession,
  revokeSession,
  publicUser,
  requestPasswordReset,
  resetPasswordWithToken,
  ensureInviteCode,
} from '../services/authService.js';
import { sendEmail } from '../services/emailService.js';
import { config } from '../lib/config.js';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

// PRD FR-03: auth routes are rate limited (10 per 15 min per IP).
// skipSuccessfulRequests: the limit is aimed at credential guessing; a
// successful login/register does not consume the budget. Failed attempts do,
// which is what the FR-03 acceptance test exercises.
//
// QA-06: the buckets are SEPARATE per concern. A single shared limiter meant
// 10 failed logins also blocked forgot-password and reset-password, so a
// legitimate user could neither log in nor recover for 15 minutes. Login
// guessing, account recovery, and registration now have independent budgets,
// and the 429 names the wait so users are not left guessing.
function makeLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const reset = req.rateLimit?.resetTime;
      const mins = reset ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 60000)) : 15;
      return res.status(429).json({
        error: `Too many attempts, try again in ${mins} minute${mins === 1 ? '' : 's'}`,
      });
    },
  });
}

const loginLimiter = makeLimiter();
const recoveryLimiter = makeLimiter();
const registerLimiter = makeLimiter();

export const authRouter = Router();

authRouter.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const user = await registerUser(data);
    const ngoProfile =
      user.role === 'NGO'
        ? await prisma.ngoProfile.findUnique({ where: { userId: user.id } })
        : undefined;
    return res.status(201).json({ user: publicUser(user, ngoProfile ?? undefined) });
  } catch (err) {
    // QA-15: a duplicate email/mobile must not confirm that the account
    // exists (the old 409 named the field). Duplicates answer with the same
    // neutral message and no user object; the client shows it with a login
    // link instead of auto-signing in. Residual note: auto-sign-in on fresh
    // registration still differs observably from this path — fully hiding
    // that would mean dropping auto-sign-in, a UX decision for the team.
    if (err.status === 409) {
      return res.json({
        message:
          'Registration received. Please log in — if this email or mobile is already registered, use your existing account.',
      });
    }
    return next(err);
  }
});

// Password reset (v3.6). The response is ALWAYS the same generic message,
// whether or not the email is registered — the endpoint must not reveal
// which emails have accounts. The token travels only by email; when email
// is not configured AND the operator explicitly enabled DEV_RESET_LINK for
// local testing, the link is included in the response instead (never in
// production defaults).
authRouter.post('/forgot-password', recoveryLimiter, async (req, res, next) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const result = await requestPasswordReset(email);
    const payload = {
      message:
        'If an account exists for that email, a password reset link has been sent. The link is valid for 30 minutes and can be used once.',
    };
    if (result) {
      const resetUrl = `${config.appBaseUrl}/reset-password?token=${result.token}`;
      const sent = await sendEmail({
        to: result.user.email,
        subject: 'Food Waste Saver — password reset',
        text: `Hello ${result.user.name},\n\nReset your password using this link (valid 30 minutes, single use):\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      });
      if (sent.skipped && config.devResetLink) payload.resetUrl = resetUrl;
    }
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

authRouter.post('/reset-password', recoveryLimiter, async (req, res, next) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);
    const ok = await resetPasswordWithToken(token, password);
    if (!ok) {
      return res.status(400).json({ error: 'This reset link is invalid, expired, or has already been used.' });
    }
    return res.json({ message: 'Password updated. Please log in with your new password.' });
  } catch (err) {
    return next(err);
  }
});

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await loginUser(data.email, data.password);
    if (!result) return res.status(401).json({ error: 'Invalid email or password' });
    return res.json({
      user: publicUser(result.user, result.ngoProfile ?? undefined),
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (err) {
    return next(err);
  }
});

authRouter.post('/refresh', loginLimiter, async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await refreshSession(refreshToken);
    if (!result) return res.status(401).json({ error: 'Invalid or expired session' });
    return res.json({ accessToken: result.accessToken });
  } catch (err) {
    return next(err);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body ?? {});
    await revokeSession(refreshToken);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const ngoProfile =
    req.user.role === 'NGO'
      ? await prisma.ngoProfile.findUnique({ where: { userId: req.user.id } })
      : undefined;
  // Lazy backfill for pre-invite accounts, plus the invite count for the
  // profile's invite section.
  const inviteCode = await ensureInviteCode(req.user.id);
  const invitesCount = await prisma.user.count({ where: { invitedById: req.user.id } });
  const user = { ...publicUser(req.user, ngoProfile ?? undefined), inviteCode, invitesCount };
  return res.json({ user });
});

// Public invite-code lookup for the landing banner: resolves a code to the
// inviter's first name only. Unknown codes answer { valid: false } —
// nothing else about any account is revealed.
// Active-role switching for USER accounts: one person acts as Claimer
// or as Donor (backend role PROVIDER). Authorization always reads the
// role from the database per request, so the switch takes effect on
// the very next call with the existing token — no re-login or token
// re-issue. NGO and ADMIN accounts have fixed roles and are refused;
// eligibility ALSO requires the current role to be CLAIMER/PROVIDER,
// so even an account whose accountType was never backfilled cannot
// switch out of a fixed role.
authRouter.post('/switch-role', requireAuth, async (req, res, next) => {
  try {
    const target = req.body?.role;
    if (target !== 'CLAIMER' && target !== 'PROVIDER') {
      return res.status(422).json({ error: 'Role must be CLAIMER or PROVIDER' });
    }
    const user = req.user;
    const isUserAccount = (user.accountType ?? 'USER') === 'USER';
    const inSwitchableRole = user.role === 'CLAIMER' || user.role === 'PROVIDER';
    if (!isUserAccount || !inSwitchableRole) {
      return res.status(403).json({ error: 'Role switching is only available for User accounts' });
    }
    if (user.role === target) {
      return res.json({ user: publicUser(user) });
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { role: target },
    });
    return res.json({ user: publicUser(updated) });
  } catch (err) {
    return next(err);
  }
});

authRouter.get('/invite/:code', async (req, res) => {
  const code = String(req.params.code ?? '').trim().toUpperCase();
  if (!code) return res.json({ valid: false });
  const inviter = await prisma.user.findUnique({ where: { inviteCode: code } });
  if (!inviter) return res.json({ valid: false });
  return res.json({ valid: true, inviterName: inviter.name });
});
