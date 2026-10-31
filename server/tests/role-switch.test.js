/**
 * User account model — accountType + active role.
 * Rules under test:
 *  - Registering as a User (accountType USER, no role) creates a USER
 *    account whose ACTIVE role defaults to CLAIMER.
 *  - A USER switches Claimer <-> Donor (PROVIDER) via
 *    POST /api/auth/switch-role with NO re-login: the SAME access token
 *    is authorized as the new role on the very next request, because
 *    authorization reads the role from the database per request.
 *  - The switch never crosses authorization boundaries: in Claimer
 *    mode listing writes are 403; in Donor mode claims are 403.
 *  - NGO and ADMIN accounts have fixed roles: switching is 403 and
 *    their role is unchanged; invalid target roles are 422; anonymous
 *    switching is 401.
 *  - Legacy registration payloads keep working: role PROVIDER/CLAIMER
 *    create USER accounts with that active role; role NGO creates an
 *    NGO account. NGO field validation still applies under accountType.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { cleanDb, uniqueEmail, uniqueMobile } from './helpers.js';
import { CHECKLIST_ITEMS } from '../src/lib/checklist.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const ALL_CHECKLIST = CHECKLIST_ITEMS.map((i) => i.id);

async function register(payload) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Role Tester', password: 'TestPass1', email: uniqueEmail('role'), mobile: uniqueMobile(), ...payload });
  return res;
}

async function login(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass1' });
  return res.body.accessToken;
}

const LISTING = {
  foodName: 'Switch Test Thali', foodDetails: 'fresh', category: 'COOKED_MEALS',
  dietaryType: 'VEG', portionType: 'PACKETS', totalPortions: 5,
  pickupLocationText: 'Karad Bus Stand',
  cookedAt: new Date(Date.now() - 3600e3).toISOString(),
  collectionDeadline: new Date(Date.now() + 3600e3).toISOString(),
  checklistItems: ALL_CHECKLIST,
};

describe('User role toggle (accountType + active role)', () => {
  let userToken;
  let userEmail;
  let donorToken;
  let listingId;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanDb();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('registering as a User defaults to a USER account acting as CLAIMER', async () => {
    const res = await register({ accountType: 'USER' });
    expect(res.status).toBe(201);
    expect(res.body.user.accountType).toBe('USER');
    expect(res.body.user.role).toBe('CLAIMER');
    userEmail = res.body.user.email;
    userToken = await login(userEmail);
    expect(userToken).toBeTruthy();
  });

  it('in Claimer mode, listing writes are forbidden (403)', async () => {
    const res = await request(app).post('/api/listings').set(auth(userToken)).send(LISTING);
    expect(res.status).toBe(403);
  });

  it('switches to Donor with the same token — the next request is authorized as PROVIDER', async () => {
    const sw = await request(app).post('/api/auth/switch-role').set(auth(userToken)).send({ role: 'PROVIDER' });
    expect(sw.status).toBe(200);
    expect(sw.body.user.role).toBe('PROVIDER');
    expect(sw.body.user.accountType).toBe('USER');

    const created = await request(app).post('/api/listings').set(auth(userToken)).send(LISTING);
    expect(created.status).toBe(201);
    listingId = created.body.listing.id;
  });

  it('in Donor mode, claiming is forbidden (403) — even for a real listing', async () => {
    // A second USER (Donor mode) publishes a listing our user could claim.
    const reg = await register({ accountType: 'USER' });
    donorToken = await login(reg.body.user.email);
    await request(app).post('/api/auth/switch-role').set(auth(donorToken)).send({ role: 'PROVIDER' });
    const created = await request(app).post('/api/listings').set(auth(donorToken)).send(LISTING);
    expect(created.status).toBe(201);
    const claimableId = created.body.listing.id;

    const claim = await request(app)
      .post('/api/claims')
      .set(auth(userToken)) // userToken is in Donor mode here
      .send({ listingId: claimableId, portions: 1 });
    expect(claim.status).toBe(403);
    listingId = claimableId;
  });

  it('switches back to Claimer and can immediately claim with the same token', async () => {
    const sw = await request(app).post('/api/auth/switch-role').set(auth(userToken)).send({ role: 'CLAIMER' });
    expect(sw.status).toBe(200);
    const claim = await request(app)
      .post('/api/claims')
      .set(auth(userToken))
      .send({ listingId, portions: 2 });
    expect(claim.status).toBe(201);
    expect(claim.body.pickupCode).toBeTruthy();
  });

  it('rejects invalid target roles (422) and anonymous switching (401)', async () => {
    for (const role of ['NGO', 'ADMIN', 'USER']) {
      const res = await request(app).post('/api/auth/switch-role').set(auth(userToken)).send({ role });
      expect(res.status).toBe(422);
    }
    const anon = await request(app).post('/api/auth/switch-role').send({ role: 'PROVIDER' });
    expect(anon.status).toBe(401);
  });

  it('an NGO account cannot switch (403) and keeps its fixed role', async () => {
    const reg = await register({ accountType: 'NGO', organisationName: 'Fixed NGO', registrationDetail: 'REG-FIXED' });
    expect(reg.status).toBe(201);
    expect(reg.body.user.accountType).toBe('NGO');
    expect(reg.body.user.role).toBe('NGO');
    const token = await login(reg.body.user.email);
    const sw = await request(app).post('/api/auth/switch-role').set(auth(token)).send({ role: 'PROVIDER' });
    expect(sw.status).toBe(403);
    const me = await request(app).get('/api/auth/me').set(auth(token));
    expect(me.body.user.role).toBe('NGO');
  });

  it('an ADMIN account cannot switch (403)', async () => {
    const hash = await bcrypt.hash('AdminPass1', 12);
    const admin = await prisma.user.create({
      data: {
        name: 'Switch Admin', email: uniqueEmail('roleadmin'), mobile: uniqueMobile(),
        passwordHash: hash, role: 'ADMIN', accountType: 'ADMIN',
      },
    });
    const res = await request(app).post('/api/auth/login').send({ email: admin.email, password: 'AdminPass1' });
    const sw = await request(app).post('/api/auth/switch-role').set(auth(res.body.accessToken)).send({ role: 'CLAIMER' });
    expect(sw.status).toBe(403);
  });

  it('legacy role payloads still register correctly (test/seed compatibility shim)', async () => {
    const provider = await register({ role: 'PROVIDER' });
    expect(provider.status).toBe(201);
    expect(provider.body.user.accountType).toBe('USER');
    expect(provider.body.user.role).toBe('PROVIDER');

    const claimer = await register({ role: 'CLAIMER' });
    expect(claimer.body.user.accountType).toBe('USER');
    expect(claimer.body.user.role).toBe('CLAIMER');

    const ngo = await register({ role: 'NGO', organisationName: 'Legacy NGO', registrationDetail: 'REG-LEG' });
    expect(ngo.body.user.accountType).toBe('NGO');
    expect(ngo.body.user.role).toBe('NGO');
  });

  it('NGO field validation still applies under accountType (422 without org fields)', async () => {
    const res = await register({ accountType: 'NGO' });
    expect(res.status).toBe(422);
  });

  it('registering with neither field defaults to a USER acting as CLAIMER', async () => {
    const res = await register({});
    expect(res.status).toBe(201);
    expect(res.body.user.accountType).toBe('USER');
    expect(res.body.user.role).toBe('CLAIMER');
  });
});
