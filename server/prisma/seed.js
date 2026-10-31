// Seed — creates/updates ONLY the protected main admin account (v3.33).
//
// The main admin is configured through the environment (server/.env,
// which is gitignored — no credential is ever committed):
//   MAIN_ADMIN_EMAIL    (default: admin@demo.local)
//   MAIN_ADMIN_NAME     (default: Main Admin)
//   MAIN_ADMIN_MOBILE   (default: 9000000004 — placeholder, change it)
//   MAIN_ADMIN_PASSWORD (REQUIRED — the seed fails clearly without it)
//
// Behaviour:
// - Idempotent: re-running changes nothing except re-applying the
//   configured password hash and the admin role/type/marker, so the
//   environment stays the source of truth for the main admin's
//   credential. The admin's name and mobile are set at creation only;
//   later profile edits are never overwritten by the seed.
// - Exactly one main admin: if another account currently carries the
//   isMainAdmin marker, the marker is moved (and the move is logged).
// - NO demo accounts, demo listings, claims, or any other data are
//   created. A fresh database starts empty apart from this one admin;
//   every other account is created through normal registration.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.MAIN_ADMIN_EMAIL ?? '').trim() || 'admin@demo.local';
  const name = (process.env.MAIN_ADMIN_NAME ?? '').trim() || 'Main Admin';
  const mobile = (process.env.MAIN_ADMIN_MOBILE ?? '').trim() || '9000000004';
  const password = process.env.MAIN_ADMIN_PASSWORD ?? '';
  if (!password) {
    console.error(
      'Seed aborted: MAIN_ADMIN_PASSWORD is not set.\n' +
        'Set it in server/.env (see server/.env.example) and re-run the seed.\n' +
        'No account was created or changed.'
    );
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.$transaction(async (tx) => {
    // Exactly one main admin: move the marker if it sits elsewhere.
    const others = await tx.user.updateMany({
      where: { isMainAdmin: true, email: { not: email } },
      data: { isMainAdmin: false },
    });
    if (others.count > 0) {
      console.log(`Moved the main-admin marker from ${others.count} other account(s) to ${email}.`);
    }
    return tx.user.upsert({
      where: { email },
      update: {
        passwordHash,
        role: 'ADMIN',
        accountType: 'ADMIN',
        isMainAdmin: true,
      },
      create: {
        name,
        email,
        mobile,
        passwordHash,
        role: 'ADMIN',
        accountType: 'ADMIN',
        isMainAdmin: true,
      },
    });
  });

  console.log(`Main admin ready: ${admin.email} (id ${admin.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
