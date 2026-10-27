import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { cleanDb, authedUser, createListing } from './helpers.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('Module 7 — Impact dashboard (FR-15) & history (FR-22)', () => {
  let provider, claimer, claimer2;
  beforeEach(async () => {
    await cleanDb();
    provider = await authedUser(app, request, { role: 'PROVIDER' });
    claimer = await authedUser(app, request, { role: 'CLAIMER' });
    claimer2 = await authedUser(app, request, { role: 'CLAIMER' });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('FR-15: seeded scenario returns exactly 180 / 50 / 30 / 60% / 0 expired', async () => {
    // 3 listings: 100 + 50 + 30 portions
    const l1 = (await createListing(app, request, provider.token, { totalPortions: 100 })).body.listing;
    const l2 = (await createListing(app, request, provider.token, { totalPortions: 50 })).body.listing;
    await createListing(app, request, provider.token, { totalPortions: 30 });
    expect(l2).toBeTruthy();

    // claims of 30 and 20
    const c1 = await request(app).post('/api/claims').set(auth(claimer.token)).send({ listingId: l1.id, portions: 30 });
    const c2 = await request(app).post('/api/claims').set(auth(claimer2.token)).send({ listingId: l1.id, portions: 20 });
    expect(c1.status).toBe(201);
    expect(c2.status).toBe(201);

    // one collection of 30
    const verify = await request(app)
      .post(`/api/claims/${c1.body.claim.id}/verify`)
      .set(auth(provider.token))
      .send({ code: c1.body.pickupCode });
    expect(verify.status).toBe(200);

    const dash = await request(app).get('/api/dashboard').set(auth(provider.token));
    expect(dash.status).toBe(200);
    expect(dash.body.platform.listingsCreated).toBe(3);
    expect(dash.body.platform.portionsListed).toBe(180);
    expect(dash.body.platform.portionsClaimed).toBe(50);
    expect(dash.body.platform.portionsCollected).toBe(30);
    expect(dash.body.platform.completionRate).toBe(60);
    expect(dash.body.platform.expiredListings).toBe(0);

    // Provider "mine" reflects only their own listings (all of them here).
    expect(dash.body.mine.portionsCollected).toBe(30);
    // Claimer view reflects their own activity.
    const dashClaimer = await request(app).get('/api/dashboard').set(auth(claimer.token));
    expect(dashClaimer.body.mine.portionsClaimed).toBe(30);
    expect(dashClaimer.body.mine.portionsCollected).toBe(30);
  });

  it('FR-15: empty database shows honest zeros, never invented numbers', async () => {
    const dash = await request(app).get('/api/dashboard').set(auth(provider.token));
    expect(dash.body.platform).toEqual({
      listingsCreated: 0,
      portionsListed: 0,
      portionsClaimed: 0,
      portionsCollected: 0,
      completionRate: 0,
      expiredListings: 0,
      ngoPortionsRedistributed: 0,
    });
  });

  it('FR-22: history includes cancelled and collected records for both sides', async () => {
    const listing = (await createListing(app, request, provider.token, { totalPortions: 40 })).body.listing;
    const c1 = await request(app).post('/api/claims').set(auth(claimer.token)).send({ listingId: listing.id, portions: 10 });
    await request(app).post(`/api/claims/${c1.body.claim.id}/cancel`).set(auth(claimer.token)).send({});
    const mine = await request(app).get('/api/claims/mine').set(auth(claimer.token));
    expect(mine.body.claims).toHaveLength(1);
    expect(mine.body.claims[0].status).toBe('CANCELLED_ON_TIME');
    const providerListings = await request(app).get('/api/listings/mine').set(auth(provider.token));
    expect(providerListings.body.listings).toHaveLength(1);
  });
});

describe('Impact wall public endpoint', () => {
  it('GET /api/dashboard/public returns aggregates without auth and no user data', async () => {
    await cleanDb();
    const p = await authedUser(app, request, { role: 'PROVIDER' });
    await createListing(app, request, p.token, { totalPortions: 25 });
    const res = await request(app).get('/api/dashboard/public');
    expect(res.status).toBe(200);
    expect(res.body.platform.portionsListed).toBe(25);
    expect(res.body.activeListings).toBe(1);
    expect(res.body.portionsAvailableNow).toBe(25);
    expect(JSON.stringify(res.body)).not.toContain('demo.local');
    expect(JSON.stringify(res.body)).not.toContain('password');
  });
});
