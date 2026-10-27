import jwt from 'jsonwebtoken';
import { config } from '../lib/config.js';
import { prisma } from '../lib/prisma.js';

// PRD FR-02/FR-03 — every protected route runs requireAuth first, then
// requireRole. Hiding a button in the UI is never the enforcement mechanism.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, config.jwtAccessSecret);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    // PRD Section 4: a suspended account can log in and view its history,
    // but every write action is blocked.
    if (req.user.suspended && req.method !== 'GET') {
      return res
        .status(403)
        .json({ error: 'Account suspended', reason: req.user.suspensionReason ?? undefined });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden for this role' });
    }
    return next();
  };
}
