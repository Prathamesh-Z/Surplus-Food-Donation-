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
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
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
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].originalName).toBe('certificate.pdf');
    expect(res.body.documents[0].sizeBytes).toBe(PDF.length);
    docId = res.body.documents[0].id;

    const list = await request(app).get('/api/ngo/documents').set(auth(ngo.token));
    expect(list.body.documents.map((d) => d.id)).toContain(docId);
  });

  it('multiple files in one submission are all stored and associated with the NGO', async () => {
    const res = await request(app)
      .post('/api/ngo/documents')
      .set(auth(ngo2.token))
      .attach('file', PDF, { filename: 'reg-certificate.pdf', contentType: 'application/pdf' })
      .attach('file', PNG, { filename: 'office-photo.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.documents).toHaveLength(2);
    expect(res.body.documents.map((d) => d.originalName).sort()).toEqual(['office-photo.png', 'reg-certificate.pdf']);

    const list = await request(app).get('/api/ngo/documents').set(auth(ngo2.token));
    expect(list.body.documents).toHaveLength(2);

    // …and the admin queue associates both with this NGO.
    const queue = await request(app).get('/api/admin/ngo/pending').set(auth(admin.token));
    const entry = queue.body.pending.find((p) => p.userId === ngo2.user.id);
    expect(entry.documents).toHaveLength(2);
  });

  it('a batch containing one invalid file is rejected atomically — nothing is stored', async () => {
    const before = await request(app).get('/api/ngo/documents').set(auth(ngo.token));
    const res = await request(app)
      .post('/api/ngo/documents')
      .set(auth(ngo.token))
      .attach('file', PDF, { filename: 'good.pdf', contentType: 'application/pdf' })
      .attach('file', NOT_PDF, { filename: 'bad.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(422);
    const after = await request(app).get('/api/ngo/documents').set(auth(ngo.token));
    expect(after.body.documents).toHaveLength(before.body.documents.length);
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
    expect(list.body.documents.map((d) => d.id)).not.toContain(docId);
    expect(list.body.documents.map((d) => d.originalName)).not.toContain('certificate.pdf');
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

describe('Admin review decisions + registration document association', () => {
  let ngo;
  let admin;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanDb();
    ngo = await authedUser(app, request, {
      role: 'NGO', organisationName: 'Review Test NGO', registrationDetail: 'REG-REV',
    });
    admin = await makeAdmin();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const queueIds = async () => {
    const q = await request(app).get('/api/admin/ngo/pending').set(auth(admin.token));
    return q.body.pending.map((p) => p.userId);
  };

  it('a fresh NGO registration has no documents and is UNVERIFIED; uploading does not verify it', async () => {
    const docs = await request(app).get('/api/ngo/documents').set(auth(ngo.token));
    expect(docs.body.documents).toHaveLength(0);
    const me = await request(app).get('/api/ngo/me').set(auth(ngo.token));
    expect(me.body.verified).toBe(false);

    // The registration flow's API sequence: register (above) → upload
    // with the new account's token → documents belong to that NGO.
    const up = await request(app)
      .post('/api/ngo/documents')
      .set(auth(ngo.token))
      .attach('file', PDF, { filename: 'at-registration.pdf', contentType: 'application/pdf' })
      .attach('file', PNG, { filename: 'at-registration.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    const me2 = await request(app).get('/api/ngo/me').set(auth(ngo.token));
    expect(me2.body.verified).toBe(false);
    expect(await queueIds()).toContain(ngo.user.id);
  });

  it('admin keeps the NGO unverified with a reason: status preserved, note shown to the NGO, queue clears, notification sent', async () => {
    const res = await request(app)
      .post(`/api/admin/ngo/${ngo.user.id}/keep-unverified`)
      .set(auth(admin.token))
      .send({ reason: 'Certificate is expired — please upload a current one' });
    expect(res.status).toBe(200);

    const me = await request(app).get('/api/ngo/me').set(auth(ngo.token));
    expect(me.body.verified).toBe(false);
    expect(me.body.profile.verificationNote).toContain('Certificate is expired');
    expect(me.body.profile.verificationReviewedAt).toBeTruthy();

    const notes = await request(app).get('/api/notifications').set(auth(ngo.token));
    expect(notes.body.notifications.some((n) => n.title === 'Verification reviewed — still unverified')).toBe(true);

    expect(await queueIds()).not.toContain(ngo.user.id);
  });

  it('a fresh document upload returns the NGO to the review queue', async () => {
    const up = await request(app)
      .post('/api/ngo/documents')
      .set(auth(ngo.token))
      .attach('file', PDF, { filename: 'renewed-certificate.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    expect(await queueIds()).toContain(ngo.user.id);
  });

  it('keep-unverified without a reason succeeds and clears the note', async () => {
    const res = await request(app)
      .post(`/api/admin/ngo/${ngo.user.id}/keep-unverified`)
      .set(auth(admin.token))
      .send({});
    expect(res.status).toBe(200);
    const me = await request(app).get('/api/ngo/me').set(auth(ngo.token));
    expect(me.body.profile.verificationNote).toBeNull();
  });

  it('keep-unverified is admin-only (403 for the NGO itself, 401 anonymous)', async () => {
    const asNgo = await request(app)
      .post(`/api/admin/ngo/${ngo.user.id}/keep-unverified`)
      .set(auth(ngo.token))
      .send({});
    expect(asNgo.status).toBe(403);
    const anon = await request(app).post(`/api/admin/ngo/${ngo.user.id}/keep-unverified`).send({});
    expect(anon.status).toBe(401);
  });

  it('a verified NGO cannot be kept unverified (409) — Unverify still works and returns it to the queue', async () => {
    const verify = await request(app).post(`/api/admin/ngo/${ngo.user.id}/verify`).set(auth(admin.token)).send({});
    expect(verify.status).toBe(200);
    const keep = await request(app)
      .post(`/api/admin/ngo/${ngo.user.id}/keep-unverified`)
      .set(auth(admin.token))
      .send({});
    expect(keep.status).toBe(409);
    const unverify = await request(app).post(`/api/admin/ngo/${ngo.user.id}/unverify`).set(auth(admin.token)).send({});
    expect(unverify.status).toBe(200);
    const me = await request(app).get('/api/ngo/me').set(auth(ngo.token));
    expect(me.body.verified).toBe(false);
    expect(me.body.profile.verificationNote).toBeNull();
    expect(await queueIds()).toContain(ngo.user.id);
  });
});
