import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { cleanDb, registerUser, uniqueEmail } from './helpers.js';

const app = createApp();

describe('Module 2 — Auth (FR-01, FR-02, FR-03)', () => {
  beforeEach(async () => {
    await cleanDb();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('FR-01: registers a provider; password stored only as bcrypt hash', async () => {
    const { res, body } = await registerUser(app, request, { role: 'PROVIDER' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('PROVIDER');
    const dbUser = await prisma.user.findUnique({ where: { email: body.email } });
    expect(dbUser.passwordHash).not.toBe(body.password);
    expect(dbUser.passwordHash.startsWith('$2')).toBe(true);
  });

  it('FR-01: duplicate email -> 409; short password -> 422; ADMIN role via public endpoint -> 422', async () => {
    const first = await registerUser(app, request, { role: 'CLAIMER' });
    expect(first.res.status).toBe(201);
    const dup = await request(app)
      .post('/api/auth/register')
      .send({ ...first.body, mobile: '9111111111' });
    expect(dup.status).toBe(409);

    const short = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'X',
        email: uniqueEmail('short'),
        mobile: '9222222222',
        password: 'Short1',
        role: 'CLAIMER',
      });
    expect(short.status).toBe(422);

    const admin = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'X',
        email: uniqueEmail('admin'),
        mobile: '9333333333',
        password: 'TestPass1',
        role: 'ADMIN',
      });
    expect(admin.status).toBe(422);
  });

  it('FR-01: NGO registration requires organisation details and creates NgoProfile', async () => {
    const missing = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'NGO',
        email: uniqueEmail('ngo'),
        mobile: '9444444444',
        password: 'TestPass1',
        role: 'NGO',
      });
    expect(missing.status).toBe(422);

    const { res } = await registerUser(app, request, {
      role: 'NGO',
      organisationName: 'Test NGO',
      registrationDetail: 'Reg 123 (synthetic)',
    });
    expect(res.status).toBe(201);
    const profile = await prisma.ngoProfile.findUnique({ where: { userId: res.body.user.id } });
    expect(profile.organisationName).toBe('Test NGO');
    expect(profile.verificationStatus).toBe('UNVERIFIED');
  });

  it('FR-02: login issues tokens; /me works; tampered token -> 401; logout revokes refresh', async () => {
    const { body } = await registerUser(app, request, { role: 'PROVIDER' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: body.email, password: body.password });
    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeTruthy();
    expect(login.body.refreshToken).toBeTruthy();

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(body.email);

    const tampered = login.body.accessToken.slice(0, -1) + (login.body.accessToken.endsWith('a') ? 'b' : 'a');
    const bad = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tampered}`);
    expect(bad.status).toBe(401);

    const noToken = await request(app).get('/api/auth/me');
    expect(noToken.status).toBe(401);

    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();

    await request(app).post('/api/auth/logout').send({ refreshToken: login.body.refreshToken });
    const afterLogout = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(afterLogout.status).toBe(401);
  });

  it('FR-02: wrong password -> 401', async () => {
    const { body } = await registerUser(app, request, { role: 'CLAIMER' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: body.email, password: 'WrongPass1' });
    expect(res.status).toBe(401);
  });

  it('FR-03: rate limit — 11th failed login attempt within 15 minutes -> 429', async () => {
    const { body } = await registerUser(app, request, { role: 'CLAIMER' });
    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: body.email, password: 'WrongPass1' });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
