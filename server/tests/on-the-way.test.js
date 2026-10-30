/**
 * PRD v3.16 (batch F1) — claimer "On the way" donor notification.
 * Exactly-once semantics: the timestamp is claimed by a single
 * conditional UPDATE inside a transaction, so repeats AND concurrent
 * requests produce exactly one notification.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { cleanDb, authedUser, createListing } from './helpers.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('PRD v3.16 — on-the-way notification', () => {
  let provider, claimer, stranger;
  beforeEach(async () => {
    await cleanDb();
    provider = await authedUser(app, request, { role: 'PROVIDER' });
    claimer = await authedUser(app, request, { role: 'CLAIMER' });
    stranger = await authedUser(app, request, { role: 'CLAIMER' });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function confirmedClaim() {
    const res = await createListing(app, request, provider.token, {});
    expect(res.status).toBe(201);
    const listing = res.body.listing;
    const claim = await request(app)
      .post('/api/claims')
      .set(auth(claimer.token))
      .send({ listingId: listing.id, portions: 3 });
    expect(claim.status).toBe(201);
    return { listing, claimId: claim.body.claim.id, code: claim.body.pickupCode };
  }

  const press = (token, id) =>
    request(app).post(`/api/claims/${id}/on-the-way`).set(auth(token)).send({});
  const donorNotes = () =>
    prisma.notification.findMany({
      where: { userId: provider.user.id, type: 'CLAIMER_ON_THE_WAY' },
    });

  it('success: 200, timestamp persisted, donor gets exactly one linked notification', async () => {
    const { listing, claimId } = await confirmedClaim();
    const res = await press(claimer.token, claimId);
    expect(res.status).toBe(200);
    expect(res.body.onTheWayAt).toBeTruthy();

    const row = await prisma.claim.findUnique({ where: { id: claimId } });
    expect(row.onTheWayAt).not.toBeNull();

    const notes = await donorNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].relatedClaimId).toBe(claimId);
    expect(notes[0].relatedListingId).toBe(listing.id);
    expect(notes[0].body).toContain(listing.foodName);
    // The claimer receives no such notification.
    const claimerNotes = await prisma.notification.count({
      where: { userId: claimer.user.id, type: 'CLAIMER_ON_THE_WAY' },
    });
    expect(claimerNotes).toBe(0);
    // And it is visible through the donor's normal notification feed.
    const feed = await request(app).get('/api/notifications').set(auth(provider.token));
    expect(feed.body.notifications.some((n) => n.type === 'CLAIMER_ON_THE_WAY')).toBe(true);
  });

  it('repeat request → 409 and still exactly one notification', async () => {
    const { claimId } = await confirmedClaim();
    expect((await press(claimer.token, claimId)).status).toBe(200);
    const second = await press(claimer.token, claimId);
    expect(second.status).toBe(409);
    expect(second.body.onTheWayAt).toBeTruthy();
    expect(await donorNotes()).toHaveLength(1);
  });

  it('concurrency: 5 parallel presses → one 200, four 409, one notification', async () => {
    const { claimId } = await confirmedClaim();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => press(claimer.token, claimId)),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409, 409, 409]);
    expect(await donorNotes()).toHaveLength(1);
    const row = await prisma.claim.findUnique({ where: { id: claimId } });
    expect(row.onTheWayAt).not.toBeNull();
  });

  it('unauthenticated → 401; provider → 403; unrelated claimer → 403', async () => {
    const { claimId } = await confirmedClaim();
    expect((await request(app).post(`/api/claims/${claimId}/on-the-way`).send({})).status).toBe(401);
    expect((await press(provider.token, claimId)).status).toBe(403);
    expect((await press(stranger.token, claimId)).status).toBe(403);
    expect(await donorNotes()).toHaveLength(0);
  });

  it('an NGO who owns the claim may press it (NGOs are claimers too)', async () => {
    const ngo = await authedUser(app, request, {
      role: 'NGO',
      organisationName: 'Test NGO',
      registrationDetail: 'REG-TEST-1',
    });
    const res = await createListing(app, request, provider.token, {});
    const claim = await request(app)
      .post('/api/claims')
      .set(auth(ngo.token))
      .send({ listingId: res.body.listing.id, portions: 2 });
    expect(claim.status).toBe(201);
    expect((await press(ngo.token, claim.body.claim.id)).status).toBe(200);
    expect(await donorNotes()).toHaveLength(1);
  });

  it('non-CONFIRMED claims are rejected 409 (cancelled and collected)', async () => {
    const a = await confirmedClaim();
    await request(app).post(`/api/claims/${a.claimId}/cancel`).set(auth(claimer.token)).send({});
    expect((await press(claimer.token, a.claimId)).status).toBe(409);

    const b = await confirmedClaim();
    const verify = await request(app)
      .post(`/api/claims/${b.claimId}/verify`)
      .set(auth(provider.token))
      .send({ code: b.code });
    expect(verify.status).toBe(200);
    expect((await press(claimer.token, b.claimId)).status).toBe(409);
    expect(await donorNotes()).toHaveLength(0);
  });

  it('non-existent claim → 404', async () => {
    const res = await press(claimer.token, '00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });

  it('/mine exposes onTheWayAt only on the owner’s own claims', async () => {
    const { claimId } = await confirmedClaim();
    const before = await request(app).get('/api/claims/mine').set(auth(claimer.token));
    const mineBefore = before.body.claims.find((c) => c.id === claimId);
    expect(mineBefore.onTheWayAt).toBeNull();

    await press(claimer.token, claimId);
    const after = await request(app).get('/api/claims/mine').set(auth(claimer.token));
    const mineAfter = after.body.claims.find((c) => c.id === claimId);
    expect(mineAfter.onTheWayAt).toBeTruthy();

    const strangerMine = await request(app).get('/api/claims/mine').set(auth(stranger.token));
    expect(strangerMine.body.claims.some((c) => c.id === claimId)).toBe(false);
  });
});
