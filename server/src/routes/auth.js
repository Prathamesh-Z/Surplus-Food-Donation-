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
} from '../services/authService.js';
import { sendEmail } from '../services/emailService.js';
import { config } from '../lib/config.js';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

// PRD FR-03: auth routes are rate limited (10 per 15 min per IP).
// skipSuccessfulRequests: the limit is aimed at credential guessing; a
// successful login/register does not consume the budget. Failed attempts do,
// which is what the FR-03 acceptance test exercises.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many attempts, try again later' }),
});

export const authRouter = Router();

authRouter.post('/register', authLimiter, async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const user = await registerUser(data);
    const ngoProfile =
      user.role === 'NGO'
        ? await prisma.ngoProfile.findUnique({ where: { userId: user.id } })
        : undefined;
    return res.status(201).json({ user: publicUser(user, ngoProfile ?? undefined) });
  } catch (err) {
    if (err.status === 409) return res.status(409).json({ error: err.message });
    return next(err);
  }
});

// Password reset (v3.6). The response is ALWAYS the same generic message,
// whether or not the email is registered — the endpoint must not reveal
// which emails have accounts. The token travels only by email; when email
// is not configured AND the operator explicitly enabled DEV_RESET_LINK for
// local testing, the link is included in the response instead (never in
// production defaults).
authRouter.post('/forgot-password', authLimiter, async (req, res, next) => {
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

authRouter.post('/reset-password', authLimiter, async (req, res, next) => {
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

authRouter.post('/login', authLimiter, async (req, res, next) => {
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

authRouter.post('/refresh', authLimiter, async (req, res, next) => {
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
  return res.json({ user: publicUser(req.user, ngoProfile ?? undefined) });
});
