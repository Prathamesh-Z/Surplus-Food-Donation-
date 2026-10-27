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
