/**
 * NGO verification documents + admin impact access.
 * Rules under test:
 *  - Only NGOs upload; PDF/JPEG/PNG/WebP only, verified by magic bytes
 *    (a renamed file is rejected); 20 MB per-file cap (413).
 *  - Documents are private: metadata appears in the admin verification
 *    queue, bytes download ONLY through the admin endpoint.
 *  - An NGO sees and deletes only its own documents.
 *  - GET /api/dashboard for an ADMIN returns platform totals with an
 *    EMPTY personal section — admins have no My Impact data.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { authedUser, cleanDb } from './helpers.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const PDF = Buffer.from('%PDF-1.4\n% verification certificate (test bytes)\n');
const NOT_PDF = Buffer.from('plain text pretending to be a pdf');

async function makeAdmin() {
  const hash = await bcrypt.hash('AdminPass1', 12);
  const user = await prisma.user.create({
    data: {
      name: 'Doc Admin',
      email: `admin-${Date.now()}@demo.local`,
      mobile: '9000000098',
      passwordHash: hash,
      role: 'ADMIN',
    },
  });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: 'AdminPass1' });
  return { user, token: login.body.accessToken };
}

describe('NGO verification documents', () => {
  let ngo;
  let ngo2;
  let provider;
  let admin;
  let docId;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanDb();
    ngo = await authedUser(app, request, {
      role: 'NGO', organisationName: 'Doc Test NGO', registrationDetail: 'REG-1',
    });
    ngo2 = await authedUser(app, request, {
      role: 'NGO', organisationName: 'Second NGO', registrationDetail: 'REG-2',
    });
    provider = await authedUser(app, request, { role: 'PROVIDER' });
    admin = await makeAdmin();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('an NGO uploads a valid PDF (201) and sees it in its list', async () => {
    const res = await request(app)
      .post('/api/ngo/documents')
      .set(auth(ngo.token))
      .attach('file', PDF, { filename: 'certificate.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(res.body.document.originalName).toBe('certificate.pdf');
    expect(res.body.document.sizeBytes).toBe(PDF.length);
    docId = res.body.document.id;

    const list = await request(app).get('/api/ngo/documents').set(auth(ngo.token));
    expect(list.body.documents.map((d) => d.id)).toContain(docId);
  });

  it('rejects a disallowed file type (422)', async () => {
    const res = await request(app)
      .post('/api/ngo/documents')
      .set(auth(ngo.token))
      .attach('file', Buffer.from('MZ binary'), { filename: 'cert.exe', contentType: 'application/x-msdownload' });
    expect(res.status).toBe(422);
  });

  it('rejects a file whose contents do not match its declared type (422)', async () => {
    const res = await request(app)
      .post('/api/ngo/documents')
      .set(auth(ngo.token))
      .attach('file', NOT_PDF, { filename: 'fake.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(422);
  });

  it('rejects a file over the 20 MB cap (413)', async () => {
    const big = Buffer.alloc(20 * 1024 * 1024 + 1, 0x25);
    const res = await request(app)
      .post('/api/ngo/documents')
      .set(auth(ngo.token))
      .attach('file', big, { filename: 'big.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(413);
  });

  it('non-NGO roles cannot upload (403) and anonymous cannot (401)', async () => {
    const asProvider = await request(app)
      .post('/api/ngo/documents')
      .set(auth(provider.token))
      .attach('file', PDF, { filename: 'c.pdf', contentType: 'application/pdf' });
    expect(asProvider.status).toBe(403);
    const anon = await request(app)
      .post('/api/ngo/documents')
      .attach('file', PDF, { filename: 'c.pdf', contentType: 'application/pdf' });
    expect(anon.status).toBe(401);
  });

  it("an NGO cannot see another NGO's documents", async () => {
    const list = await request(app).get('/api/ngo/documents').set(auth(ngo2.token));
    expect(list.body.documents).toHaveLength(0);
  });

  it('the admin queue carries the document metadata, and only an admin can download the bytes', async () => {
    const queue = await request(app).get('/api/admin/ngo/pending').set(auth(admin.token));
    const entry = queue.body.pending.find((p) => p.userId === ngo.user.id);
    expect(entry).toBeTruthy();
    expect(entry.documents.map((d) => d.id)).toContain(docId);

    const dl = await request(app)
      .get(`/api/admin/ngo-documents/${docId}`)
      .set(auth(admin.token))
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(dl.status).toBe(200);
    expect(Buffer.from(dl.body).equals(PDF)).toBe(true);

    const asNgo = await request(app).get(`/api/admin/ngo-documents/${docId}`).set(auth(ngo.token));
    expect(asNgo.status).toBe(403);
  });

  it('an NGO deletes its own document; another NGO gets 404 for it', async () => {
    const notMine = await request(app).delete(`/api/ngo/documents/${docId}`).set(auth(ngo2.token));
    expect(notMine.status).toBe(404);
    const del = await request(app).delete(`/api/ngo/documents/${docId}`).set(auth(ngo.token));
    expect(del.status).toBe(200);
    const list = await request(app).get('/api/ngo/documents').set(auth(ngo.token));
    expect(list.body.documents).toHaveLength(0);
  });

  it('admin dashboard API: platform totals with an empty personal section', async () => {
    const res = await request(app).get('/api/dashboard').set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.platform).toBeTruthy();
    expect(res.body.mine).toEqual({});
  });
});
