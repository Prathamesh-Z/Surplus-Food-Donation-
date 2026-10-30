import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { cleanDb, authedUser, createListing } from './helpers.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const inMinutes = (m) => new Date(Date.now() + m * 60000).toISOString();

describe('Module 4 — Discovery (FR-07, FR-08)', () => {
  let provider, claimer;
  beforeEach(async () => {
    await cleanDb();
    provider = await authedUser(app, request, { role: 'PROVIDER' });
    claimer = await authedUser(app, request, { role: 'CLAIMER' });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('FR-07: browse is ordered by deadline ascending (30, 60, 120)', async () => {
    await createListing(app, request, provider.token, {
      foodName: 'Late',
      collectionDeadline: inMinutes(120),
    });
    await createListing(app, request, provider.token, {
      foodName: 'Soon',
      collectionDeadline: inMinutes(30),
    });
    await createListing(app, request, provider.token, {
      foodName: 'Mid',
      collectionDeadline: inMinutes(60),
    });
    const res = await request(app).get('/api/listings').set(auth(claimer.token));
    expect(res.status).toBe(200);
    expect(res.body.listings.map((l) => l.foodName)).toEqual(['Soon', 'Mid', 'Late']);
    const soon = res.body.listings[0];
    expect(soon.timeRemainingMinutes).toBeGreaterThanOrEqual(29);
    expect(soon.timeRemainingMinutes).toBeLessThanOrEqual(31);
    expect(soon.portionsRemaining).toBe(100);
  });

  it('FR-07: drafts and cancelled listings never appear in browse', async () => {
    const draft = await createListing(app, request, provider.token, {
      foodName: 'DraftOne',
      checklistItems: [],
    });
    expect(draft.body.listing.status).toBe('DRAFT');
    const live = await createListing(app, request, provider.token, { foodName: 'LiveOne' });
    await request(app)
      .post(`/api/listings/${live.body.listing.id}/cancel`)
      .set(auth(provider.token))
      .send({ reason: 'No longer available' });
    const res = await request(app).get('/api/listings').set(auth(claimer.token));
    expect(res.body.listings).toHaveLength(0);
  });

  it('FR-08: category + ending-soon filters return exactly the matching seeded set', async () => {
    await createListing(app, request, provider.token, {
      foodName: 'Bakery Soon',
      category: 'BAKERY',
      collectionDeadline: inMinutes(45),
    });
    await createListing(app, request, provider.token, {
      foodName: 'Bakery Later',
      category: 'BAKERY',
      collectionDeadline: inMinutes(180),
    });
    await createListing(app, request, provider.token, {
      foodName: 'Rice Soon',
      category: 'COOKED_MEALS',
      collectionDeadline: inMinutes(30),
    });
    const res = await request(app)
      .get('/api/listings?category=BAKERY&endingSoon=true')
      .set(auth(claimer.token));
    expect(res.body.listings.map((l) => l.foodName)).toEqual(['Bakery Soon']);
  });

  it('FR-08: search is a case-insensitive substring on name and details', async () => {
    await createListing(app, request, provider.token, {
      foodName: 'Jeera RICE bowl',
      foodDetails: 'Steamed',
    });
    await createListing(app, request, provider.token, {
      foodName: 'Salad',
      foodDetails: 'with rice flakes',
    });
    await createListing(app, request, provider.token, { foodName: 'Soup', foodDetails: 'Tomato' });
    const res = await request(app).get('/api/listings?q=rice').set(auth(claimer.token));
    expect(res.body.listings).toHaveLength(2);
  });

  it('BUG-01: search tolerates leading/trailing and repeated whitespace; multi-word and punctuation names match', async () => {
    await createListing(app, request, provider.token, {
      foodName: 'Misal Pav',
      foodDetails: 'Spicy curry with bread',
    });
    await createListing(app, request, provider.token, {
      foodName: "St. John's Wort Soup",
      foodDetails: 'Herbal',
    });
    await createListing(app, request, provider.token, { foodName: 'Soup', foodDetails: 'Tomato' });

    const names = async (q) => {
      const res = await request(app)
        .get(`/api/listings?q=${encodeURIComponent(q)}`)
        .set(auth(claimer.token));
      expect(res.status).toBe(200);
      return res.body.listings.map((l) => l.foodName);
    };

    // Exact + case-insensitive multi-word (pre-existing behaviour).
    expect(await names('Misal Pav')).toEqual(['Misal Pav']);
    expect(await names('misal pav')).toEqual(['Misal Pav']);
    // Whitespace shapes that previously returned nothing.
    expect(await names('  Misal Pav')).toEqual(['Misal Pav']);
    expect(await names('Misal Pav  ')).toEqual(['Misal Pav']);
    expect(await names('Misal    Pav')).toEqual(['Misal Pav']);
    expect(await names('Misal\tPav')).toEqual(['Misal Pav']);
    // Periods and apostrophes are literal, not syntax.
    expect(await names("St. John's Wort")).toEqual(["St. John's Wort Soup"]);
    // A whitespace-only query behaves like no query at all.
    const all = await request(app).get('/api/listings?q=%20%20').set(auth(claimer.token));
    expect(all.body.listings.length).toBe(3);
  });

  it('FR-08: ngoSuitable, dietary and portion-type filters', async () => {
    await createListing(app, request, provider.token, {
      foodName: 'Bulk Dal',
      ngoSuitable: true,
      portionType: 'BULK_SERVINGS',
    });
    await createListing(app, request, provider.token, { foodName: 'Single Meal' });
    const ngo = await request(app).get('/api/listings?ngoSuitable=true').set(auth(claimer.token));
    expect(ngo.body.listings.map((l) => l.foodName)).toEqual(['Bulk Dal']);
    const bulk = await request(app)
      .get('/api/listings?portionType=BULK_SERVINGS')
      .set(auth(claimer.token));
    expect(bulk.body.listings.map((l) => l.foodName)).toEqual(['Bulk Dal']);
    const veg = await request(app).get('/api/listings?dietaryType=VEG').set(auth(claimer.token));
    expect(veg.body.listings).toHaveLength(2);
  });

  it('FR-08: availableOnly=false also shows FULLY_CLAIMED, never EXPIRED/CANCELLED', async () => {
    const full = await prisma.listing.create({
      data: {
        providerId: provider.user.id,
        foodName: 'Fully Claimed One',
        foodDetails: 'x',
        category: 'COOKED_MEALS',
        dietaryType: 'VEG',
        portionType: 'INDIVIDUAL_MEALS',
        totalPortions: 10,
        portionsRemaining: 0,
        pickupLocationText: 'Gate',
        cookedAt: new Date(Date.now() - 3600e3),
        collectionDeadline: new Date(Date.now() + 3600e3),
        checklistConfirmedItems: [],
        status: 'FULLY_CLAIMED',
      },
    });
    await prisma.listing.create({
      data: {
        providerId: provider.user.id,
        foodName: 'Expired One',
        foodDetails: 'x',
        category: 'COOKED_MEALS',
        dietaryType: 'VEG',
        portionType: 'INDIVIDUAL_MEALS',
        totalPortions: 10,
        portionsRemaining: 5,
        pickupLocationText: 'Gate',
        cookedAt: new Date(Date.now() - 7200e3),
        collectionDeadline: new Date(Date.now() - 3600e3),
        checklistConfirmedItems: [],
        status: 'EXPIRED',
      },
    });
    expect(full.status).toBe('FULLY_CLAIMED');
    const def = await request(app).get('/api/listings').set(auth(claimer.token));
    expect(def.body.listings).toHaveLength(0);
    const all = await request(app)
      .get('/api/listings?availableOnly=false')
      .set(auth(claimer.token));
    expect(all.body.listings.map((l) => l.foodName)).toEqual(['Fully Claimed One']);
  });
});
