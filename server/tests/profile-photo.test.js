/**
 * Profile photos — POST/DELETE /api/users/me/photo.
 * Rules under test:
 *  - Optional: accounts start with profilePhoto null (default silhouette).
 *  - JPEG/PNG/WebP accepted (allowlist + magic bytes — a renamed file
 *    is rejected), 5 MB cap (413), unauthenticated 401.
 *  - The stored path is served under /uploads/avatars/; changing a
 *    photo deletes the previous file; DELETE restores the default.
 *  - /me-scoped: one user's photo never affects another user.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { authedUser, cleanDb } from './helpers.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'latin1'), Buffer.from([0x10, 0x00, 0x00, 0x00]), Buffer.from('WEBP', 'latin1'),
]);
const PDF = Buffer.from('%PDF-1.4\nnot an image at all\n');

async function fetchBytes(url) {
  return request(app)
    .get(url)
    .buffer(true)
    .parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
}

describe('Profile photos', () => {
  let user;
  let other;
  let photoPath;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanDb();
    user = await authedUser(app, request, { role: 'CLAIMER' });
    other = await authedUser(app, request, { role: 'PROVIDER' });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('accounts start without a photo', async () => {
    const me = await request(app).get('/api/auth/me').set(auth(user.token));
    expect(me.body.user.profilePhoto).toBeNull();
  });

  it('uploads a JPEG: 200, path stored, bytes served under /uploads/avatars/', async () => {
    const res = await request(app)
      .post('/api/users/me/photo')
      .set(auth(user.token))
      .attach('file', JPEG, { filename: 'me.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    photoPath = res.body.user.profilePhoto;
    expect(photoPath).toMatch(/^\/uploads\/avatars\/.+\.jpg$/);

    const served = await fetchBytes(photoPath);
    expect(served.status).toBe(200);
    expect(Buffer.from(served.body).equals(JPEG)).toBe(true);
  });

  it('accepts PNG and WebP as well', async () => {
    const png = await request(app)
      .post('/api/users/me/photo')
      .set(auth(user.token))
      .attach('file', PNG, { filename: 'me.png', contentType: 'image/png' });
    expect(png.status).toBe(200);
    expect(png.body.user.profilePhoto).toMatch(/\.png$/);
    const webp = await request(app)
      .post('/api/users/me/photo')
      .set(auth(user.token))
      .attach('file', WEBP, { filename: 'me.webp', contentType: 'image/webp' });
    expect(webp.status).toBe(200);
    expect(webp.body.user.profilePhoto).toMatch(/\.webp$/);
    photoPath = webp.body.user.profilePhoto;
  });

  it('changing the photo deletes the previous file', async () => {
    const before = photoPath;
    const res = await request(app)
      .post('/api/users/me/photo')
      .set(auth(user.token))
      .attach('file', JPEG, { filename: 'new.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.user.profilePhoto).not.toBe(before);
    photoPath = res.body.user.profilePhoto;
    const old = await request(app).get(before);
    expect(old.status).toBe(404);
  });

  it('rejects a file whose contents do not match its declared type (422)', async () => {
    const res = await request(app)
      .post('/api/users/me/photo')
      .set(auth(user.token))
      .attach('file', PDF, { filename: 'fake.png', contentType: 'image/png' });
    expect(res.status).toBe(422);
  });

  it('rejects a non-image file type (422)', async () => {
    const res = await request(app)
      .post('/api/users/me/photo')
      .set(auth(user.token))
      .attach('file', PDF, { filename: 'doc.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(422);
  });

  it('rejects a photo over the 5 MB cap (413)', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0x00);
    JPEG.copy(big, 0);
    const res = await request(app)
      .post('/api/users/me/photo')
      .set(auth(user.token))
      .attach('file', big, { filename: 'big.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(413);
  });

  it('requires authentication (401)', async () => {
    const res = await request(app)
      .post('/api/users/me/photo')
      .attach('file', JPEG, { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(401);
  });

  it("one user's photo never affects another user", async () => {
    const me = await request(app).get('/api/auth/me').set(auth(other.token));
    expect(me.body.user.profilePhoto).toBeNull();
  });

  it('DELETE removes the photo and its file; deleting again is a no-op success', async () => {
    const del = await request(app).delete('/api/users/me/photo').set(auth(user.token));
    expect(del.status).toBe(200);
    expect(del.body.user.profilePhoto).toBeNull();
    const gone = await request(app).get(photoPath);
    expect(gone.status).toBe(404);
    const again = await request(app).delete('/api/users/me/photo').set(auth(user.token));
    expect(again.status).toBe(200);
    expect(again.body.user.profilePhoto).toBeNull();
  });
});
