/**
 * Profile name editing — PATCH /api/users/me/name.
 * Rules under test:
 *  - Updates ONLY the caller's own name (id from the auth token).
 *  - Same validation as registration: trimmed, non-blank.
 *  - Persists: /api/auth/me reflects the new name afterwards.
 *  - Requires authentication.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { authedUser, cleanDb } from './helpers.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('profile name editing', () => {
  let user;
  let other;
  beforeAll(async () => {
    await prisma.$connect();
    await cleanDb();
    user = await authedUser(app, request, { role: 'PROVIDER', name: 'Original Name' });
    other = await authedUser(app, request, { role: 'CLAIMER', name: 'Other Person' });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("updates the caller's name and returns it trimmed", async () => {
    const res = await request(app)
      .patch('/api/users/me/name')
      .set(auth(user.token))
      .send({ name: '  New Display Name  ' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Display Name');
  });

  it('persists: /api/auth/me shows the new name', async () => {
    const me = await request(app).get('/api/auth/me').set(auth(user.token));
    expect(me.status).toBe(200);
    expect(me.body.user.name).toBe('New Display Name');
  });

  it('rejects empty and whitespace-only names, leaving the old name intact', async () => {
    for (const name of ['', '   ']) {
      const res = await request(app)
        .patch('/api/users/me/name')
        .set(auth(user.token))
        .send({ name });
      expect(res.status).toBe(422); // the API's validation-error status
    }
    const me = await request(app).get('/api/auth/me').set(auth(user.token));
    expect(me.body.user.name).toBe('New Display Name');
  });

  it('does not touch any other user', async () => {
    const row = await prisma.user.findUnique({ where: { id: other.user.id } });
    expect(row.name).toBe('Other Person');
  });

  it('requires authentication', async () => {
    const res = await request(app).patch('/api/users/me/name').send({ name: 'Anon' });
    expect(res.status).toBe(401);
  });
});
