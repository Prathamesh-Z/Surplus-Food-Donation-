import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { cleanDb, authedUser, createListing } from './helpers.js';
import { codeHmac } from '../src/services/pickupCodeService.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const WRONG_CODE = 'ZZZZ9999'; // valid format, (almost certainly) not the issued code

async function makeListing(token, overrides = {}) {
  const res = await createListing(app, request, token, overrides);
  if (res.status !== 201) throw new Error(`listing failed ${res.status}`);
  return res.body.listing;
}

describe('Module 5 — Claims & pickup codes (FR-09 to FR-12)', () => {
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

  it('FR-09: claiming 30 of 100 leaves 70 and issues an 8-char code; duplicate codes impossible (J6 uniqueness)', async () => {
    const listing = await makeListing(provider.token, { totalPortions: 100 });
    const res = await request(app)
      .post('/api/claims')
      .set(auth(claimer.token))
      .send({ listingId: listing.id, portions: 30 });
    expect(res.status).toBe(201);
    expect(res.body.pickupCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const after = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(after.portionsRemaining).toBe(70);
    expect(after.status).toBe('PARTIALLY_CLAIMED');

    // Uniqueness: inserting a second ACTIVE claim with the same HMAC must fail.
    const hmac = codeHmac(res.body.pickupCode);
    await expect(
      prisma.claim.create({
        data: {
          listingId: listing.id,
          claimerId: ngo.user.id,
          portionsClaimed: 1,
          pickupCodeHmac: hmac,
        },
      })
    ).rejects.toThrow();
  });

  it('FR-09: rejects 0, -5, 2.5, over-remaining, own listing; expired listing cannot be claimed', async () => {
    const listing = await makeListing(provider.token, { totalPortions: 10 });
    for (const portions of [0, -5, 2.5]) {
      const res = await request(app)
        .post('/api/claims')
        .set(auth(claimer.token))
        .send({ listingId: listing.id, portions });
      expect(res.status).toBe(422);
    }
    const over = await request(app)
      .post('/api/claims')
      .set(auth(claimer.token))
      .send({ listingId: listing.id, portions: 11 });
    expect(over.status).toBe(409);

    const own = await request(app)
      .post('/api/claims')
      .set(auth(provider.token))
      .send({ listingId: listing.id, portions: 1 });
    expect([403, 422]).toContain(own.status); // provider role blocked at role middleware

    const stale = await prisma.listing.create({
      data: {
        providerId: provider.user.id,
        foodName: 'Stale',
        foodDetails: 'x',
        category: 'COOKED_MEALS',
        dietaryType: 'VEG',
        portionType: 'INDIVIDUAL_MEALS',
        totalPortions: 5,
        portionsRemaining: 5,
        pickupLocationText: 'Gate',
        cookedAt: new Date(Date.now() - 7200e3),
        collectionDeadline: new Date(Date.now() - 60000),
        checklistConfirmedItems: [],
        status: 'LIVE',
      },
    });
    const expired = await request(app)
      .post('/api/claims')
      .set(auth(claimer.token))
      .send({ listingId: stale.id, portions: 1 });
    expect(expired.status).toBe(409);
  });

  it('FR-09 concurrency gate: 1 portion left, 2 simultaneous claims -> exactly 1 succeeds, remaining 0, never negative', async () => {
    const listing = await makeListing(provider.token, { totalPortions: 1 });
    const claimer2 = await authedUser(app, request, { role: 'CLAIMER' });
    const results = await Promise.all([
      request(app).post('/api/claims').set(auth(claimer.token)).send({ listingId: listing.id, portions: 1 }),
      request(app).post('/api/claims').set(auth(claimer2.token)).send({ listingId: listing.id, portions: 1 }),
    ]);
    const successes = results.filter((r) => r.status === 201);
    expect(successes).toHaveLength(1);
    const after = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(after.portionsRemaining).toBe(0);
    expect(after.status).toBe('FULLY_CLAIMED');
  });

  it('FR-09 concurrency gate: 50 parallel claims of 5 on 100 portions -> exactly 20 succeed, remaining exactly 0', async () => {
    const listing = await makeListing(provider.token, { totalPortions: 100 });
    const users = [claimer, ngo];
    for (let i = 0; i < 3; i++) users.push(await authedUser(app, request, { role: 'CLAIMER' }));
    const attempts = Array.from({ length: 50 }, (_, i) =>
      request(app)
        .post('/api/claims')
        .set(auth(users[i % users.length].token))
        .send({ listingId: listing.id, portions: 5 })
    );
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r.status === 201)).toHaveLength(20);
    const after = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(after.portionsRemaining).toBe(0);
  }, 30000);

  it('FR-10: cancel 2h before deadline returns portions; cancel 10 min before does not (CANCELLED_LATE)', async () => {
    const early = await makeListing(provider.token, {
      totalPortions: 50,
      collectionDeadline: new Date(Date.now() + 2 * 3600e3).toISOString(),
    });
    const c1 = await request(app)
      .post('/api/claims')
      .set(auth(claimer.token))
      .send({ listingId: early.id, portions: 20 });
    const cancel1 = await request(app)
      .post(`/api/claims/${c1.body.claim.id}/cancel`)
      .set(auth(claimer.token))
      .send({});
    expect(cancel1.status).toBe(200);
    expect(cancel1.body.claim.status).toBe('CANCELLED_ON_TIME');
    expect(cancel1.body.portionsReturned).toBe(20);
    const afterEarly = await prisma.listing.findUnique({ where: { id: early.id } });
    expect(afterEarly.portionsRemaining).toBe(50);

    const late = await makeListing(provider.token, {
      totalPortions: 50,
      collectionDeadline: new Date(Date.now() + 10 * 60000).toISOString(),
    });
    const c2 = await request(app)
      .post('/api/claims')
      .set(auth(claimer.token))
      .send({ listingId: late.id, portions: 20 });
    const cancel2 = await request(app)
      .post(`/api/claims/${c2.body.claim.id}/cancel`)
      .set(auth(claimer.token))
      .send({});
    expect(cancel2.body.claim.status).toBe('CANCELLED_LATE');
    expect(cancel2.body.portionsReturned).toBe(0);
    const afterLate = await prisma.listing.findUnique({ where: { id: late.id } });
    expect(afterLate.portionsRemaining).toBe(30);
    // Code fields cleared at terminal state
    const dbClaim = await prisma.claim.findUnique({ where: { id: c2.body.claim.id } });
    expect(dbClaim.pickupCodeHmac).toBeNull();
    expect(dbClaim.pickupCodeEncrypted).toBeNull();
  });

  it('FR-11: owner can re-view the code while active; after collection the code endpoint returns 409 and stores are cleared', async () => {
    const listing = await makeListing(provider.token, { totalPortions: 10 });
    const c = await request(app)
      .post('/api/claims')
      .set(auth(claimer.token))
      .send({ listingId: listing.id, portions: 4 });
    const claimId = c.body.claim.id;
    const review = await request(app).get(`/api/claims/${claimId}/code`).set(auth(claimer.token));
    expect(review.status).toBe(200);
    expect(review.body.pickupCode).toBe(c.body.pickupCode);

    const other = await request(app).get(`/api/claims/${claimId}/code`).set(auth(ngo.token));
    expect(other.status).toBe(403);

    const verify = await request(app)
      .post(`/api/claims/${claimId}/verify`)
      .set(auth(provider.token))
      .send({ code: c.body.pickupCode });
    expect(verify.status).toBe(200);
    const afterTerminal = await request(app)
      .get(`/api/claims/${claimId}/code`)
      .set(auth(claimer.token));
    expect(afterTerminal.status).toBe(409);
    const dbClaim = await prisma.claim.findUnique({ where: { id: claimId } });
    expect(dbClaim.pickupCodeHmac).toBeNull();
    expect(dbClaim.pickupCodeEncrypted).toBeNull();
    expect(dbClaim.pickupCodeHash).toBeNull();
  });

  it('FR-12: provider verifies with the code -> COLLECTED; second verify is idempotent with the same collectedAt', async () => {
    const listing = await makeListing(provider.token, { totalPortions: 10 });
    const c = await request(app)
      .post('/api/claims')
      .set(auth(claimer.token))
      .send({ listingId: listing.id, portions: 3 });
    const claimId = c.body.claim.id;

    const wrongActor = await request(app)
      .post(`/api/claims/${claimId}/verify`)
      .set(auth(claimer.token))
      .send({ code: c.body.pickupCode });
    expect(wrongActor.status).toBe(403);

    const first = await request(app)
      .post(`/api/claims/${claimId}/verify`)
      .set(auth(provider.token))
      .send({ code: c.body.pickupCode });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('COLLECTED');
    expect(first.body.alreadyCollected).toBe(false);

    const second = await request(app)
      .post(`/api/claims/${claimId}/verify`)
      .set(auth(provider.token))
      .send({ code: c.body.pickupCode });
    expect(second.status).toBe(200);
    expect(second.body.alreadyCollected).toBe(true);
    expect(second.body.collectedAt).toBe(first.body.collectedAt);
  });

  it('FR-12: wrong code never collects; 5 wrong attempts lock verification for 10 minutes', async () => {
    const listing = await makeListing(provider.token, { totalPortions: 10 });
    const c = await request(app)
      .post('/api/claims')
      .set(auth(claimer.token))
      .send({ listingId: listing.id, portions: 3 });
    const claimId = c.body.claim.id;
    const code = c.body.pickupCode === WRONG_CODE ? 'YYYY8888' : WRONG_CODE;

    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post(`/api/claims/${claimId}/verify`)
        .set(auth(provider.token))
        .send({ code });
      expect(res.status).toBe(401);
    }
    const fifth = await request(app)
      .post(`/api/claims/${claimId}/verify`)
      .set(auth(provider.token))
      .send({ code });
    expect(fifth.status).toBe(401);
    const dbClaim = await prisma.claim.findUnique({ where: { id: claimId } });
    expect(dbClaim.status).toBe('CONFIRMED');
    expect(dbClaim.verifyLockedUntil).toBeTruthy();

    const duringLock = await request(app)
      .post(`/api/claims/${claimId}/verify`)
      .set(auth(provider.token))
      .send({ code: c.body.pickupCode });
    expect(duringLock.status).toBe(423);
  });

  it('FR-06 link: provider cancels a claimed listing -> open claims become CANCELLED_BY_PROVIDER and claimer is notified', async () => {
    const listing = await makeListing(provider.token, { totalPortions: 10 });
    const c = await request(app)
      .post('/api/claims')
      .set(auth(claimer.token))
      .send({ listingId: listing.id, portions: 5 });
    const cancel = await request(app)
      .post(`/api/listings/${listing.id}/cancel`)
      .set(auth(provider.token))
      .send({ reason: 'Kitchen emergency' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.cancelledClaims).toBe(1);
    const dbClaim = await prisma.claim.findUnique({ where: { id: c.body.claim.id } });
    expect(dbClaim.status).toBe('CANCELLED_BY_PROVIDER');
    const notes = await prisma.notification.findMany({
      where: { userId: claimer.user.id, type: 'LISTING_CANCELLED' },
    });
    expect(notes).toHaveLength(1);
  });
});
