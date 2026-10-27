import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { registerSchema, loginSchema, refreshSchema } from '../validators/auth.js';
import {
  registerUser,
  loginUser,
  refreshSession,
  revokeSession,
  publicUser,
} from '../services/authService.js';
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
