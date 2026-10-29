/**
 * v3.6 — registration normalization + password reset + notification dismiss.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { authedUser, cleanDb, createListing } from './helpers.js';
import { __setEmailTransportForTests } from '../src/services/emailService.js';

const app = createApp();
const sentEmails = [];

describe('v3.6 — registration normalization', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanDb();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('accepts mobiles typed as +91 / spaced / leading-0 and stores the normalized 10 digits', async () => {
    for (const [i, mobile] of ['+91 98123 45678', '919812345679', '09812345680'].entries()) {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Norm Test',
          email: `norm${i}@t.in`,
          mobile,
          password: 'Passw0rd!',
          role: 'CLAIMER',
        });
      expect(res.status).toBe(201);
      expect(res.body.user.mobile).toMatch(/^[6-9]\d{9}$/);
    }
  });

  it('NGO registration with blank-string org fields gives the specific NGO error, not a mystery failure', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'NGO Blank',
        email: 'ngoblank@t.in',
        mobile: '9812345681',
        password: 'Passw0rd!',
        role: 'NGO',
        organisationName: '',
        registrationDetail: '',
      });
    expect(res.status).toBe(422);
    const flat = JSON.stringify(res.body.details?.fieldErrors ?? {});
    expect(flat).toMatch(/organisationName|registrationDetail/);
  });
});

describe('v3.6 — password reset', () => {
  let user;
  beforeAll(async () => {
    await cleanDb();
    __setEmailTransportForTests(async (msg) => {
      sentEmails.push(msg);
      return { sent: true };
    });
    user = await authedUser(app, request, { role: 'CLAIMER' });
  });
  afterAll(async () => {
    __setEmailTransportForTests(null);
    await prisma.$disconnect();
  });

  async function requestReset(email) {
    sentEmails.length = 0;
    const res = await request(app).post('/api/auth/forgot-password').send({ email });
    expect(res.status).toBe(200);
    // Generic response only — never a token, never account existence.
    expect(res.body.resetUrl).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
    const mail = sentEmails.find((m) => m.to === email);
    if (!mail) return null;
    const match = mail.text.match(/token=([a-f0-9]{64})/);
    return match?.[1] ?? null;
  }

  it('unknown email: same generic 200, no email sent, no token stored', async () => {
    const before = await prisma.passwordResetToken.count();
    const token = await requestReset('nobody-here@t.in');
    expect(token).toBeNull();
    expect(await prisma.passwordResetToken.count()).toBe(before);
  });

  it('full flow: email carries the link, reset works, old password dies, sessions revoked, token single-use', async () => {
    const email = user.creds.email;
    // an existing session that must be revoked by the reset
    const preLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password: user.creds.password });
    const oldRefresh = preLogin.body.refreshToken;
    const token = await requestReset(email);
    expect(token).toBeTruthy();

    // token is stored hashed only
    const rows = await prisma.passwordResetToken.findMany({ where: { userId: user.user.id } });
    expect(rows.length).toBe(1);
    expect(rows[0].tokenHash).not.toBe(token);
    expect(rows[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);

    const bad = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'deadbeef'.repeat(8), password: 'NewPass1!' });
    expect(bad.status).toBe(400);

    const ok = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'NewPass1!' });
    expect(ok.status).toBe(200);

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password: user.creds.password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'NewPass1!' });
    expect(newLogin.status).toBe(200);

    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken: oldRefresh });
    expect(refresh.status).toBe(401);

    const reuse = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'Another1!' });
    expect(reuse.status).toBe(400);
  });

  it('expired token is rejected', async () => {
    const token = await requestReset(user.creds.email);
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.user.id, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'Whatever1!' });
    expect(res.status).toBe(400);
  });

  it('a second reset request invalidates the first token', async () => {
    const first = await requestReset(user.creds.email);
    const second = await requestReset(user.creds.email);
    const useFirst = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: first, password: 'Whatever1!' });
    expect(useFirst.status).toBe(400);
    const useSecond = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: second, password: 'Whatever1!' });
    expect(useSecond.status).toBe(200);
  });
});

describe('v3.6 — notification dismiss', () => {
  let provider; let claimer;
  beforeAll(async () => {
    await cleanDb();
    provider = await authedUser(app, request, { role: 'PROVIDER' });
    claimer = await authedUser(app, request, { role: 'CLAIMER' });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('claim notifies the provider once; dismiss removes it for the owner only', async () => {
    const { res } = { res: await createListing(app, request, provider.token, {}) };
    const claim = await request(app)
      .post('/api/claims')
      .set('Authorization', `Bearer ${claimer.token}`)
      .send({ listingId: res.body.listing.id, portions: 2 });
    expect(claim.status).toBe(201);

    const list = await request(app).get('/api/notifications').set('Authorization', `Bearer ${provider.token}`);
    const note = list.body.notifications.find((n) => n.type === 'CLAIM_PLACED');
    expect(note).toBeTruthy();
    expect(note.relatedListingId).toBe(res.body.listing.id);
    expect(note.relatedClaimId).toBe(claim.body.claim.id);
    expect(list.body.unreadCount).toBeGreaterThanOrEqual(1);

    // another user cannot dismiss it
    const foreign = await request(app)
      .delete(`/api/notifications/${note.id}`)
      .set('Authorization', `Bearer ${claimer.token}`);
    expect(foreign.status).toBe(404);

    const gone = await request(app)
      .delete(`/api/notifications/${note.id}`)
      .set('Authorization', `Bearer ${provider.token}`);
    expect(gone.status).toBe(200);
    const after = await request(app).get('/api/notifications').set('Authorization', `Bearer ${provider.token}`);
    expect(after.body.notifications.find((n) => n.id === note.id)).toBeUndefined();
  });
});
