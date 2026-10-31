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
    accountType: user.accountType ?? 'USER',
    profilePhoto: user.profilePhoto ?? null,
    languagePref: user.languagePref,
    suspended: user.suspended,
    inviteCode: user.inviteCode ?? null,
    ...(ngoProfile !== undefined ? { ngoProfile } : {}),
  };
}

// Invite codes: 8 characters from an unambiguous alphabet (no 0/O/1/I),
// so a code read off a screen or a poster still types correctly.
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeInviteCode() {
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += INVITE_ALPHABET[crypto.randomInt(INVITE_ALPHABET.length)];
  }
  return code;
}

export async function generateUniqueInviteCode(tx = prisma) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = makeInviteCode();
    const clash = await tx.user.findUnique({ where: { inviteCode: code } });
    if (!clash) return code;
  }
  throw new Error('Could not generate a unique invite code');
}

// Lazy backfill: accounts created before invite links existed get their
// code the first time it is needed (profile/invite endpoints). Idempotent.
export async function ensureInviteCode(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  if (user.inviteCode) return user.inviteCode;
  const code = await generateUniqueInviteCode();
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { inviteCode: code },
  });
  return updated.inviteCode;
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
  // Invite attribution: a valid code links the new account to its inviter.
  // An unknown code is ignored (never a signup error) so a mistyped link
  // can never block registration.
  let invitedById = null;
  const rawCode = typeof data.inviteCode === 'string' ? data.inviteCode.trim().toUpperCase() : '';
  if (rawCode) {
    const inviter = await prisma.user.findUnique({ where: { inviteCode: rawCode } });
    if (inviter) invitedById = inviter.id;
  }
  // Resolve the account model from the registration payload: an NGO
  // account (accountType NGO, or the legacy role NGO) is fixed-role;
  // every other registration is a USER account whose ACTIVE role is the
  // legacy PROVIDER/CLAIMER choice when given, else CLAIMER (the
  // approved default — the user can switch to Donor at any time).
  const accountType = data.accountType ?? (data.role === 'NGO' ? 'NGO' : 'USER');
  const role =
    accountType === 'NGO'
      ? 'NGO'
      : data.role === 'PROVIDER' || data.role === 'CLAIMER'
        ? data.role
        : 'CLAIMER';
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        mobile: data.mobile,
        passwordHash,
        role,
        accountType,
        inviteCode: await generateUniqueInviteCode(tx),
        invitedById,
      },
    });
    if (accountType === 'NGO') {
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
