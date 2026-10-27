import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { cleanDb, authedUser, createListing } from './helpers.js';
import { runExpiryPass } from '../src/services/expiryService.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const inMinutes = (m) => new Date(Date.now() + m * 60000).toISOString();

describe('Module 6 — Expiry & notifications (FR-13, FR-14)', () => {
  let provider, claimer, ngo;
  beforeEach(async () => {
    await cleanDb();
    provider = await authedUser(app, request, { role: 'PROVIDER' });
    claimer = await authedUser(app, request, { role: 'CLAIMER' });
    ngo = await authedUser(app, request, {
      role: 'NGO',
      organisationName: 'Test NGO',
      registrationDetail: 'Reg (synthetic)',
    });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('FR-14: a new listing notifies every Claimer and NGO account', async () => {
    const before = await prisma.notification.count({ where: { type: 'NEW_LISTING' } });
    await createListing(app, request, provider.token, {});
    const notes = await prisma.notification.findMany({ where: { type: 'NEW_LISTING' } });
    expect(notes.length - before).toBe(2); // 1 claimer + 1 NGO in this test DB
    expect(notes.map((n) => n.userId).sort()).toEqual([claimer.user.id, ngo.user.id].sort());
  });

  it('FR-13: expiry pass expires a past-deadline listing and its open claim, clearing the pickup code', async () => {
    const created = await createListing(app, request, provider.token, {
      totalPortions: 10,
      collectionDeadline: inMinutes(5),
    });
    const listingId = created.body.listing.id;
    const claimRes = await request(app)
      .post('/api/claims')
      .set(auth(claimer.token))
      .send({ listingId, portions: 4 });
    expect(claimRes.status).toBe(201);

    // Simulate the deadline passing, then run one pass.
    await prisma.listing.update({
      where: { id: listingId },
      data: { collectionDeadline: new Date(Date.now() - 60000) },
    });
    const summary = await runExpiryPass();
    expect(summary.listingsExpired).toBe(1);
    expect(summary.claimsExpired).toBe(1);

    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    expect(listing.status).toBe('EXPIRED');
    const claim = await prisma.claim.findUnique({ where: { id: claimRes.body.claim.id } });
    expect(claim.status).toBe('EXPIRED');
    expect(claim.pickupCodeHmac).toBeNull();
    expect(claim.pickupCodeEncrypted).toBeNull();

    // Expired listing is absent from browse
    const browse = await request(app).get('/api/listings?availableOnly=false').set(auth(claimer.token));
    expect(browse.body.listings.find((l) => l.id === listingId)).toBeUndefined();

    // Verify on an expired claim returns the specific expired message
    const verify = await request(app)
      .post(`/api/claims/${claim.id}/verify`)
      .set(auth(provider.token))
      .send({ code: claimRes.body.pickupCode });
    expect(verify.status).toBe(409);
    expect(verify.body.error).toMatch(/expired/i);
  });

  it('FR-14: near-deadline alerts fire once per threshold across repeated passes', async () => {
    const created = await createListing(app, request, provider.token, {
      totalPortions: 10,
      collectionDeadline: inMinutes(25), // inside both the 60-min and 30-min windows
    });
    await request(app)
      .post('/api/claims')
      .set(auth(claimer.token))
      .send({ listingId: created.body.listing.id, portions: 2 });

    await runExpiryPass();
    await runExpiryPass(); // second pass must not duplicate

    const providerNotes = await prisma.notification.findMany({
      where: { userId: provider.user.id, type: 'NEAR_DEADLINE_PROVIDER' },
    });
    expect(providerNotes).toHaveLength(1);
    const claimerNotes = await prisma.notification.findMany({
      where: { userId: claimer.user.id, type: 'NEAR_DEADLINE_CLAIMERS' },
    });
    expect(claimerNotes).toHaveLength(1);
    const ngoNotes = await prisma.notification.findMany({
      where: { userId: ngo.user.id, type: 'NEAR_DEADLINE_CLAIMERS' },
    });
    expect(ngoNotes).toHaveLength(1);
  });

  it('FR-14: notifications API lists own notifications, supports mark-read and read-all', async () => {
    await createListing(app, request, provider.token, {});
    const list = await request(app).get('/api/notifications').set(auth(claimer.token));
    expect(list.status).toBe(200);
    expect(list.body.unreadCount).toBe(1);
    const noteId = list.body.notifications[0].id;

    const read = await request(app)
      .post(`/api/notifications/${noteId}/read`)
      .set(auth(claimer.token))
      .send({});
    expect(read.status).toBe(200);
    expect(read.body.notification.read).toBe(true);

    const other = await request(app)
      .post(`/api/notifications/${noteId}/read`)
      .set(auth(ngo.token))
      .send({});
    expect(other.status).toBe(404);

    const all = await request(app)
      .post('/api/notifications/read-all')
      .set(auth(claimer.token))
      .send({});
    expect(all.status).toBe(200);
    const after = await request(app).get('/api/notifications').set(auth(claimer.token));
    expect(after.body.unreadCount).toBe(0);
  });
});
