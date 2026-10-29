import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { config } from '../lib/config.js';

const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 7;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function publicUser(user, ngoProfile = undefined) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    role: user.role,
    languagePref: user.languagePref,
    suspended: user.suspended,
    ...(ngoProfile !== undefined ? { ngoProfile } : {}),
  };
}

export async function registerUser(data) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: data.email }, { mobile: data.mobile }] },
  });
  if (existing) {
    const field = existing.email === data.email ? 'email' : 'mobile';
    const err = new Error(`An account with this ${field} already exists`);
    err.status = 409;
    throw err;
  }
  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        mobile: data.mobile,
        passwordHash,
        role: data.role,
      },
    });
    if (data.role === 'NGO') {
      await tx.ngoProfile.create({
        data: {
          userId: created.id,
          organisationName: data.organisationName,
          registrationDetail: data.registrationDetail,
        },
      });
    }
    return created;
  });
  return user;
}

export async function createSession(user) {
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: 'pending',
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  const accessToken = jwt.sign({ sub: user.id, role: user.role }, config.jwtAccessSecret, {
    expiresIn: ACCESS_TTL,
  });
  const refreshToken = jwt.sign({ sub: user.id, sid: session.id }, config.jwtRefreshSecret, {
    expiresIn: `${REFRESH_TTL_DAYS}d`,
  });
  await prisma.session.update({
    where: { id: session.id },
    data: { refreshTokenHash: hashToken(refreshToken) },
  });
  return { accessToken, refreshToken };
}

export async function loginUser(email, password) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  const tokens = await createSession(user);
  const ngoProfile =
    user.role === 'NGO' ? await prisma.ngoProfile.findUnique({ where: { userId: user.id } }) : null;
  return { user, ngoProfile, ...tokens };
}

export async function refreshSession(refreshToken) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, config.jwtRefreshSecret);
  } catch {
    return null;
  }
  const session = await prisma.session.findUnique({ where: { id: payload.sid } });
  if (!session || session.revoked || session.expiresAt < new Date()) return null;
  if (session.refreshTokenHash !== hashToken(refreshToken)) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return null;
  const accessToken = jwt.sign({ sub: user.id, role: user.role }, config.jwtAccessSecret, {
    expiresIn: ACCESS_TTL,
  });
  return { accessToken, user };
}

export async function revokeSession(refreshToken) {
  try {
    const payload = jwt.verify(refreshToken, config.jwtRefreshSecret, { ignoreExpiration: true });
    await prisma.session.updateMany({
      where: { id: payload.sid },
      data: { revoked: true },
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Password reset (v3.6) ────────────────────────────────────────────────
const RESET_TTL_MS = 30 * 60 * 1000;

/**
 * Create a single-use reset token for the account with this email, if one
 * exists. Returns the plaintext token (for the email/dev link) or null when
 * no account matches — callers must respond identically either way so the
 * endpoint never reveals whether an email is registered. Any earlier
 * unused tokens for the user are invalidated first.
 */
export async function requestPasswordReset(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });
  return { token, user };
}

/**
 * Consume a reset token: validates hash, single-use and expiry; sets the
 * new password (bcrypt, same cost as registration); revokes ALL of the
 * user's sessions so old refresh tokens stop working immediately.
 * Returns true on success, false for any invalid/expired/used token.
 */
export async function resetPasswordWithToken(token, newPassword) {
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) return false;
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    prisma.session.updateMany({ where: { userId: row.userId }, data: { revoked: true } }),
  ]);
  return true;
}
