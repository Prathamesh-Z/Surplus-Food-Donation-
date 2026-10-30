import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import {
  cleanDb,
  authedUser,
  createListing,
  registerUser,
  uniqueEmail,
  ALL_CHECKLIST_IDS,
} from './helpers.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

// QA-fixes (BUG_REPORT.md QA-01..QA-20): server-side behaviour changes.
// Client-only fixes (header, hamburger, copy button, modals) are covered by
// the CDP browser checks, not here.
describe('QA fixes', () => {
  let provider;
  beforeEach(async () => {
    await cleanDb();
    provider = await authedUser(app, request, { role: 'PROVIDER' });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('QA-05: browse list + detail work without a token and expose no contact to anonymous viewers', async () => {
    const created = await createListing(app, request, provider.token, {
      showContact: true,
      contactPhone: '9876543210',
    });
    expect(created.status).toBe(201);
    const id = created.body.listing.id;

    const list = await request(app).get('/api/listings');
    expect(list.status).toBe(200);
    expect(list.body.listings.some((l) => l.id === id)).toBe(true);
    expect(list.body.listings.find((l) => l.id === id).donorContact).toBeUndefined();

    const detail = await request(app).get(`/api/listings/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.listing.id).toBe(id);
    expect(detail.body.listing.donorContact).toBeUndefined();

    // Authenticated provider view still shows its own contact.
    const own = await request(app).get(`/api/listings/${id}`).set(auth(provider.token));
    expect(own.body.listing.donorContact).toBe('9876543210');
  });

  it('QA-19: PATCH on a LIVE listing past its deadline -> 409; a stale DRAFT stays editable', async () => {
    const live = await createListing(app, request, provider.token, {});
    const liveId = live.body.listing.id;
    // Simulate the pre-sweep window: deadline passed, status still LIVE.
    await prisma.listing.update({
      where: { id: liveId },
      data: { collectionDeadline: new Date(Date.now() - 60000) },
    });
    const editLive = await request(app)
      .patch(`/api/listings/${liveId}`)
      .set(auth(provider.token))
      .send({ totalPortions: 90 });
    expect(editLive.status).toBe(409);
    expect(editLive.body.error).toMatch(/expired/);

    const draft = await createListing(app, request, provider.token, { checklistItems: [] });
    const draftId = draft.body.listing.id;
    expect(draft.body.listing.status).toBe('DRAFT');
    await prisma.listing.update({
      where: { id: draftId },
      data: { collectionDeadline: new Date(Date.now() - 60000) },
    });
    const editDraft = await request(app)
      .patch(`/api/listings/${draftId}`)
      .set(auth(provider.token))
      .send({ totalPortions: 80 });
    expect(editDraft.status).toBe(200);
  });

  it('QA-19: publish on a past-deadline DRAFT -> 409', async () => {
    const draft = await createListing(app, request, provider.token, { checklistItems: [] });
    const id = draft.body.listing.id;
    await prisma.listing.update({
      where: { id },
      data: { collectionDeadline: new Date(Date.now() - 60000) },
    });
    const pub = await request(app)
      .post(`/api/listings/${id}/publish`)
      .set(auth(provider.token))
      .send({ checklistItems: ALL_CHECKLIST_IDS });
    expect(pub.status).toBe(409);
  });

  it('QA-20: foodName >200 and foodDetails >2000 -> 422; at the caps -> 201', async () => {
    const longName = await createListing(app, request, provider.token, {
      foodName: 'x'.repeat(201),
    });
    expect(longName.status).toBe(422);
    const longDetails = await createListing(app, request, provider.token, {
      foodDetails: 'y'.repeat(2001),
    });
    expect(longDetails.status).toBe(422);
    const atCap = await createListing(app, request, provider.token, {
      foodName: 'z'.repeat(200),
      foodDetails: 'w'.repeat(2000),
    });
    expect(atCap.status).toBe(201);
  });

  it('QA-15: duplicate mobile -> 200 generic, no user object, no second account', async () => {
    const first = await registerUser(app, request, { role: 'CLAIMER' });
    expect(first.res.status).toBe(201);
    const dup = await request(app)
      .post('/api/auth/register')
      .send({ ...first.body, email: uniqueEmail('other') });
    expect(dup.status).toBe(200);
    expect(dup.body.user).toBeUndefined();
    expect(dup.body.message).toMatch(/already registered/);
    const count = await prisma.user.count({ where: { mobile: first.body.mobile } });
    expect(count).toBe(1);
  });

  it('QA-07: new-listing notification body uses a locale date, not ISO', async () => {
    // New-listing notifications go to claimers/NGOs — one must exist.
    await authedUser(app, request, { role: 'CLAIMER' });
    const created = await createListing(app, request, provider.token, {});
    expect(created.status).toBe(201);
    const notes = await prisma.notification.findMany({
      where: { relatedListingId: created.body.listing.id, type: 'NEW_LISTING' },
    });
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.body).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
      expect(n.body).toMatch(/collect by /);
    }
  });

  it('Headers: X-Powered-By hidden, nosniff present', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  // Last: it exhausts the login budget for this file's app instance.
  it('QA-06: exhausting the login budget leaves password recovery working', async () => {
    const { body } = await registerUser(app, request, { role: 'CLAIMER' });
    let lastStatus = 0;
    let lastBody = {};
    for (let i = 0; i < 11; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: body.email, password: 'WrongPass1' });
      lastStatus = res.status;
      lastBody = res.body;
    }
    expect(lastStatus).toBe(429);
    expect(lastBody.error).toMatch(/try again in \d+ minutes?/);
    const forgot = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: body.email });
    expect(forgot.status).toBe(200);
    expect(forgot.body.message).toMatch(/If an account exists/);
  });
});
