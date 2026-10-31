import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { cleanDb, authedUser, uniqueEmail, uniqueMobile } from './helpers.js';

// v3.33 — Admin user management: promote / demote / delete with the
// main-admin and last-admin invariants, audit-actor deletion refusal,
// and the role-switching contract around them.
const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function makeAdmin({ main = false } = {}) {
  const hash = await bcrypt.hash('AdminPass1', 12);
  const user = await prisma.user.create({
    data: {
      name: main ? 'Main Admin' : 'Test Admin',
      email: uniqueEmail('admin'),
      mobile: uniqueMobile(),
      passwordHash: hash,
      role: 'ADMIN',
      accountType: 'ADMIN',
      isMainAdmin: main,
    },
  });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: 'AdminPass1' });
  if (login.status !== 200) throw new Error(`admin login failed: ${login.status}`);
  return { user, token: login.body.accessToken };
}

describe('Admin user management (v3.33)', () => {
  beforeEach(async () => {
    await cleanDb();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects non-admin and anonymous access to user management', async () => {
    const admin = await makeAdmin();
    const user = await authedUser(app, request, { role: 'CLAIMER' });
    const list = await request(app).get('/api/admin/users').set(auth(user.token));
    expect(list.status).toBe(403);
    const promote = await request(app)
      .post(`/api/admin/users/${user.user.id}/promote`)
      .set(auth(user.token));
    expect(promote.status).toBe(403);
    const anon = await request(app).get('/api/admin/users');
    expect(anon.status).toBe(401);
    // The admin's own list works and exposes type + marker, never secrets.
    const ok = await request(app).get('/api/admin/users').set(auth(admin.token));
    expect(ok.status).toBe(200);
    const row = ok.body.users.find((u) => u.id === admin.user.id);
    expect(row.accountType).toBe('ADMIN');
    expect(row.isMainAdmin).toBe(false);
    expect(JSON.stringify(ok.body)).not.toContain('passwordHash');
    expect(JSON.stringify(ok.body)).not.toContain('refreshTokenHash');
  });

  it('promotes a USER to ADMIN (both fields) and audits it', async () => {
    const admin = await makeAdmin();
    const user = await authedUser(app, request, { role: 'CLAIMER' });
    const res = await request(app)
      .post(`/api/admin/users/${user.user.id}/promote`)
      .set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.user.accountType).toBe('ADMIN');
    expect(res.body.user.role).toBe('ADMIN');
    const row = await prisma.user.findUnique({ where: { id: user.user.id } });
    expect(row.accountType).toBe('ADMIN');
    expect(row.role).toBe('ADMIN');
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'PROMOTE_USER', targetId: user.user.id },
    });
    expect(audit?.adminId).toBe(admin.user.id);
  });

  it('refuses to promote an NGO account or an existing admin (409)', async () => {
    const admin = await makeAdmin();
    const ngo = await authedUser(app, request, {
      role: 'NGO',
      organisationName: 'Seva Trust',
      registrationDetail: 'Reg 42 (synthetic)',
    });
    const ngoRes = await request(app)
      .post(`/api/admin/users/${ngo.user.id}/promote`)
      .set(auth(admin.token));
    expect(ngoRes.status).toBe(409);
    const again = await request(app)
      .post(`/api/admin/users/${admin.user.id}/promote`)
      .set(auth(admin.token));
    expect(again.status).toBe(409);
    const missing = await request(app)
      .post('/api/admin/users/00000000-0000-0000-0000-000000000000/promote')
      .set(auth(admin.token));
    expect(missing.status).toBe(404);
  });

  it('demotes an ADMIN back to USER/CLAIMER and audits it', async () => {
    const admin = await makeAdmin();
    const other = await makeAdmin();
    const res = await request(app)
      .post(`/api/admin/users/${other.user.id}/demote`)
      .set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.user.accountType).toBe('USER');
    expect(res.body.user.role).toBe('CLAIMER');
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'DEMOTE_USER', targetId: other.user.id },
    });
    expect(audit?.adminId).toBe(admin.user.id);
  });

  it('protects the main admin from demotion and deletion', async () => {
    const main = await makeAdmin({ main: true });
    const admin = await makeAdmin();
    const demote = await request(app)
      .post(`/api/admin/users/${main.user.id}/demote`)
      .set(auth(admin.token));
    expect(demote.status).toBe(409);
    const del = await request(app)
      .delete(`/api/admin/users/${main.user.id}`)
      .set(auth(admin.token));
    expect(del.status).toBe(409);
    const row = await prisma.user.findUnique({ where: { id: main.user.id } });
    expect(row?.accountType).toBe('ADMIN');
    expect(row?.isMainAdmin).toBe(true);
  });

  it('protects the last remaining admin from demotion and deletion', async () => {
    const solo = await makeAdmin();
    const demote = await request(app)
      .post(`/api/admin/users/${solo.user.id}/demote`)
      .set(auth(solo.token));
    expect(demote.status).toBe(409);
    const del = await request(app)
      .delete(`/api/admin/users/${solo.user.id}`)
      .set(auth(solo.token));
    expect(del.status).toBe(409);
    const row = await prisma.user.findUnique({ where: { id: solo.user.id } });
    expect(row?.accountType).toBe('ADMIN');
  });

  it('deletes a user with related records and keeps the DELETE_USER audit row', async () => {
    const admin = await makeAdmin();
    const provider = await authedUser(app, request, { role: 'PROVIDER' });
    const claimer = await authedUser(app, request, { role: 'CLAIMER' });
    const now = Date.now();
    const listing = await prisma.listing.create({
      data: {
        providerId: provider.user.id,
        foodName: 'Cooked Rice',
        foodDetails: 'Fixture listing',
        category: 'COOKED_MEALS',
        dietaryType: 'VEG',
        portionType: 'INDIVIDUAL_MEALS',
        totalPortions: 50,
        portionsRemaining: 40,
        pickupLocationText: 'Fixture place',
        cookedAt: new Date(now - 3600_000),
        collectionDeadline: new Date(now + 3600_000),
        status: 'PARTIALLY_CLAIMED',
      },
    });
    const claim = await prisma.claim.create({
      data: {
        listingId: listing.id,
        claimerId: claimer.user.id,
        portionsClaimed: 10,
        status: 'CONFIRMED',
      },
    });
    await prisma.notification.create({
      data: {
        userId: provider.user.id,
        type: 'CLAIM_PLACED',
        title: 'Fixture',
        body: 'Fixture notification',
        relatedListingId: listing.id,
        relatedClaimId: claim.id,
      },
    });

    const res = await request(app)
      .delete(`/api/admin/users/${provider.user.id}`)
      .set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: provider.user.id } })).toBeNull();
    expect(await prisma.listing.findUnique({ where: { id: listing.id } })).toBeNull();
    expect(await prisma.claim.findUnique({ where: { id: claim.id } })).toBeNull();
    expect(
      await prisma.notification.count({ where: { userId: provider.user.id } })
    ).toBe(0);
    // The audit row survives the deletion: its targetId is a plain string.
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'DELETE_USER', targetId: provider.user.id },
    });
    expect(audit?.adminId).toBe(admin.user.id);
    // The claimer is untouched.
    expect(await prisma.user.findUnique({ where: { id: claimer.user.id } })).not.toBeNull();
  });

  it('refuses to delete an audit actor but allows demoting them', async () => {
    const main = await makeAdmin({ main: true });
    const actor = await makeAdmin();
    const victim = await authedUser(app, request, { role: 'CLAIMER' });
    const suspend = await request(app)
      .post(`/api/admin/users/${victim.user.id}/suspend`)
      .set(auth(actor.token))
      .send({ reason: 'Fixture suspension' });
    expect(suspend.status).toBe(200);
    const del = await request(app)
      .delete(`/api/admin/users/${actor.user.id}`)
      .set(auth(main.token));
    expect(del.status).toBe(409);
    expect(del.body.error).toContain('audit log');
    const demote = await request(app)
      .post(`/api/admin/users/${actor.user.id}/demote`)
      .set(auth(main.token));
    expect(demote.status).toBe(200);
    // The actor's audit history is still intact after the demotion.
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'SUSPEND_USER', adminId: actor.user.id },
    });
    expect(audit).not.toBeNull();
  });

  it('keeps role switching USER-only: promoted admins cannot switch, demoted users can', async () => {
    const admin = await makeAdmin();
    const user = await authedUser(app, request, { role: 'CLAIMER' });
    // USER switching works before promotion.
    const before = await request(app)
      .post('/api/auth/switch-role')
      .set(auth(user.token))
      .send({ role: 'PROVIDER' });
    expect(before.status).toBe(200);
    await request(app)
      .post(`/api/admin/users/${user.user.id}/promote`)
      .set(auth(admin.token));
    const asAdmin = await request(app)
      .post('/api/auth/switch-role')
      .set(auth(user.token))
      .send({ role: 'CLAIMER' });
    expect(asAdmin.status).toBe(403);
    await request(app)
      .post(`/api/admin/users/${user.user.id}/demote`)
      .set(auth(admin.token));
    const after = await request(app)
      .post('/api/auth/switch-role')
      .set(auth(user.token))
      .send({ role: 'PROVIDER' });
    expect(after.status).toBe(200);
    expect(after.body.user.role).toBe('PROVIDER');
  });
});
