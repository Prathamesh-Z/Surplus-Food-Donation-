// Guarded clean reset (v3.33) — deletes ALL application data while
// preserving exactly the one protected main admin account.
//
// Safety contract (enforced by this script, not by convention):
// - The target is read from DATABASE_URL in server/.env and must be a
//   LOCAL database named exactly "food_waste_saver". The test database,
//   any remote host, and any other name are refused before any query
//   that could modify data.
// - Exactly one account must carry the isMainAdmin marker; otherwise
//   the script aborts (run the seed first so the main admin exists).
// - Without --yes the script prints the verified target and the table
//   counts and exits WITHOUT deleting anything.
// - With --yes: one transaction deletes every application row except
//   the main admin's User row (audit logs included — a clean slate),
//   then uploaded files (listing photos, avatars, NGO documents) are
//   removed, the result is verified, the seed is re-run, and the clean
//   state is verified again (seed idempotency proof).
//
// Usage: npm run db:reset-clean --workspace=server -- --yes
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const UPLOADS_DIR = path.join(__dirname, '../uploads');
const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars');
const NGO_DOCS_DIR = path.join(__dirname, '../private/ngo-documents');

function refuse(message) {
  console.error(`RESET REFUSED: ${message}`);
  process.exit(1);
}

// ── 1. Verify the target before touching anything ─────────────────────
const rawUrl = process.env.DATABASE_URL ?? '';
if (!rawUrl) refuse('DATABASE_URL is not set in server/.env.');
let url;
try {
  url = new URL(rawUrl);
} catch {
  refuse('DATABASE_URL is not a parseable URL.');
}
const dbName = url.pathname.replace(/^\//, '');
const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
if (!['postgresql:', 'postgres:'].includes(url.protocol)) {
  refuse(`unexpected protocol "${url.protocol}" — expected postgresql:.`);
}
if (!localHosts.has(url.hostname)) {
  refuse(`host "${url.hostname}" is not local — this script only resets a local database.`);
}
if (dbName !== 'food_waste_saver') {
  refuse(`database "${dbName}" is not "food_waste_saver" — the test database and any other target are out of scope.`);
}
console.log(`Verified reset target: ${url.hostname}:${url.port || 5432}/${dbName} (local application database)`);

const prisma = new PrismaClient();

async function tableCounts() {
  const [users, listings, claims, notifications, liveLocations, recurring, redist, audit, sessions, ngoProfiles, ngoDocuments, passwordResets] =
    await Promise.all([
      prisma.user.count(),
      prisma.listing.count(),
      prisma.claim.count(),
      prisma.notification.count(),
      prisma.liveLocation.count(),
      prisma.recurringSchedule.count(),
      prisma.redistributionLog.count(),
      prisma.auditLog.count(),
      prisma.session.count(),
      prisma.ngoProfile.count(),
      prisma.ngoDocument.count(),
      prisma.passwordResetToken.count(),
    ]);
  return { users, listings, claims, notifications, liveLocations, recurring, redist, audit, sessions, ngoProfiles, ngoDocuments, passwordResets };
}

function printCounts(label, c) {
  console.log(
    `${label}: users=${c.users} listings=${c.listings} claims=${c.claims} notifications=${c.notifications} ` +
      `liveLocations=${c.liveLocations} recurring=${c.recurring} redistributionLogs=${c.redist} auditLogs=${c.audit} ` +
      `sessions=${c.sessions} ngoProfiles=${c.ngoProfiles} ngoDocuments=${c.ngoDocuments} passwordResets=${c.passwordResets}`
  );
}

function cleanDirFiles(dir, label) {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile()) {
      fs.unlinkSync(path.join(dir, entry.name));
      removed += 1;
    }
  }
  console.log(`Removed ${removed} file(s) from ${label}.`);
  return removed;
}

async function main() {
  // ── 2. The main admin must be identifiable and unique ───────────────
  const mains = await prisma.user.findMany({
    where: { isMainAdmin: true },
    select: { id: true, email: true },
  });
  if (mains.length !== 1) {
    refuse(
      `expected exactly 1 main admin (isMainAdmin), found ${mains.length}. ` +
        'Run the seed first (npm run db:seed) so the main admin exists, then re-run.'
    );
  }
  const mainAdmin = mains[0];
  console.log(`Main admin to preserve: ${mainAdmin.email} (id ${mainAdmin.id})`);

  const before = await tableCounts();
  printCounts('Before', before);

  if (!process.argv.includes('--yes')) {
    console.log('DRY RUN — nothing was deleted. Re-run with --yes to execute the reset.');
    return;
  }

  // ── 3. Delete everything except the main admin, in one transaction ──
  await prisma.$transaction(async (tx) => {
    await tx.liveLocation.deleteMany({});
    await tx.redistributionLog.deleteMany({});
    await tx.claim.deleteMany({});
    await tx.listing.deleteMany({});
    await tx.notification.deleteMany({});
    await tx.auditLog.deleteMany({});
    await tx.recurringSchedule.deleteMany({});
    await tx.ngoDocument.deleteMany({});
    await tx.ngoProfile.deleteMany({});
    await tx.passwordResetToken.deleteMany({});
    await tx.session.deleteMany({});
    await tx.user.deleteMany({ where: { id: { not: mainAdmin.id } } });
  });
  console.log('Database rows deleted (main admin preserved).');

  // ── 4. Files on disk: photos, avatars, NGO documents ────────────────
  cleanDirFiles(UPLOADS_DIR, 'server/uploads');
  cleanDirFiles(AVATARS_DIR, 'server/uploads/avatars');
  cleanDirFiles(NGO_DOCS_DIR, 'server/private/ngo-documents');

  // ── 5. Verify the clean state ────────────────────────────────────────
  const after = await tableCounts();
  printCounts('After', after);
  const survivor = await prisma.user.findUnique({ where: { id: mainAdmin.id } });
  const clean =
    after.users === 1 &&
    survivor?.isMainAdmin === true &&
    Object.entries(after).every(([k, v]) => k === 'users' || v === 0);
  if (!clean) refuse('post-reset verification failed — the database is not in the expected clean state.');
  console.log('Post-reset verification passed: exactly one main admin, all application data cleared.');

  // ── 6. Re-run the seed and verify idempotency ────────────────────────
  console.log('Re-running the seed to verify idempotency…');
  const seed = spawnSync(process.execPath, [path.join(__dirname, 'seed.js')], {
    stdio: 'inherit',
    env: process.env,
  });
  if (seed.status !== 0) refuse('seed re-run failed — see its output above.');
  const final = await tableCounts();
  printCounts('After seed', final);
  if (final.users !== 1 || final.listings !== 0 || final.claims !== 0) {
    refuse('seed idempotency verification failed — the seed created unexpected data.');
  }
  console.log('Seed idempotency verified: still exactly one main admin, no demo activity.');
  console.log('RESET COMPLETE.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
