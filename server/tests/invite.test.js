import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { cleanDb, authedUser, registerUser } from './helpers.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

// Invite links: unique per-user codes, attribution on signup, counts.
describe('Invite links', () => {
  beforeEach(async () => {
    await cleanDb();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('registration generates an 8-character invite code', async () => {
    const { res } = await registerUser(app, request, { role: 'CLAIMER' });
    expect(res.status).toBe(201);
    expect(res.body.user.inviteCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it('two users get different invite codes', async () => {
    const a = await registerUser(app, request, { role: 'CLAIMER' });
    const b = await registerUser(app, request, { role: 'CLAIMER' });
    expect(a.res.body.user.inviteCode).not.toBe(b.res.body.user.inviteCode);
  });

  it('signup with a valid code attributes the inviter', async () => {
    const inviter = await authedUser(app, request, { role: 'CLAIMER' });
    const me = await request(app).get('/api/auth/me').set(auth(inviter.token));
    const code = me.body.user.inviteCode;
    expect(code).toBeTruthy();
    const joined = await registerUser(app, request, { role: 'CLAIMER', inviteCode: code });
    expect(joined.res.status).toBe(201);
    const row = await prisma.user.findUnique({ where: { email: joined.body.email } });
    expect(row.invitedById).toBe(inviter.user.id);
  });

  it('signup with an unknown code still succeeds and is unattributed (ignored, not an error)', async () => {
    const joined = await registerUser(app, request, { role: 'CLAIMER', inviteCode: 'ZZZZZZZZ' });
    expect(joined.res.status).toBe(201);
    const row = await prisma.user.findUnique({ where: { email: joined.body.email } });
    expect(row.invitedById).toBeNull();
  });

  it('invitesCount reflects attributed signups', async () => {
    const inviter = await authedUser(app, request, { role: 'CLAIMER' });
    const me = await request(app).get('/api/auth/me').set(auth(inviter.token));
    expect(me.body.user.invitesCount).toBe(0);
    await registerUser(app, request, { role: 'CLAIMER', inviteCode: me.body.user.inviteCode });
    await registerUser(app, request, { role: 'CLAIMER', inviteCode: me.body.user.inviteCode });
    const after = await request(app).get('/api/auth/me').set(auth(inviter.token));
    expect(after.body.user.invitesCount).toBe(2);
  });

  it('public invite lookup resolves a valid code and rejects an unknown one', async () => {
    const inviter = await authedUser(app, request, { role: 'CLAIMER' });
    const me = await request(app).get('/api/auth/me').set(auth(inviter.token));
    const ok = await request(app).get(`/api/auth/invite/${me.body.user.inviteCode}`);
    expect(ok.status).toBe(200);
    expect(ok.body.valid).toBe(true);
    expect(ok.body.inviterName).toBe(inviter.user.name);
    const bad = await request(app).get('/api/auth/invite/ZZZZZZZZ');
    expect(bad.status).toBe(200);
    expect(bad.body.valid).toBe(false);
  });

  it('pre-invite accounts get a code lazily from /me (backfill)', async () => {
    const user = await authedUser(app, request, { role: 'CLAIMER' });
    await prisma.user.update({ where: { id: user.user.id }, data: { inviteCode: null } });
    const me = await request(app).get('/api/auth/me').set(auth(user.token));
    expect(me.body.user.inviteCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const row = await prisma.user.findUnique({ where: { id: user.user.id } });
    expect(row.inviteCode).toBe(me.body.user.inviteCode);
  });
});
