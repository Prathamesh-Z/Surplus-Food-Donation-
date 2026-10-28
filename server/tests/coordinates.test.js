/**
 * v3.5 — listing pickup coordinates: stored separately from the readable
 * address, range-validated, both-or-neither, and returned by the API so
 * clients can compute distance. Absent coordinates stay null (distance
 * unavailable) — never silently zero.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { authedUser, cleanDb, createListing } from './helpers.js';

const app = createApp();

describe('v3.5 — listing pickup coordinates', () => {
  let provider; let claimer;
  beforeAll(async () => {
    await prisma.$connect();
    await cleanDb();
    provider = await authedUser(app, request, { role: 'PROVIDER' });
    claimer = await authedUser(app, request, { role: 'CLAIMER' });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('stores and returns a valid coordinate pair', async () => {
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${provider.token}`)
      .send({
        foodName: 'Coord Listing', foodDetails: 'x', category: 'BAKERY',
        dietaryType: 'VEG', portionType: 'PACKETS', totalPortions: 5,
        pickupLocationText: 'Karad Bus Stand',
        pickupLat: 17.276, pickupLng: 74.184,
        cookedAt: new Date(Date.now() - 3600e3).toISOString(),
        collectionDeadline: new Date(Date.now() + 3600e3).toISOString(),
        checklistItems: [],
      });
    expect(res.status).toBe(201);
    expect(res.body.listing.pickupLat).toBeCloseTo(17.276);
    expect(res.body.listing.pickupLng).toBeCloseTo(74.184);
    // (checklistItems is empty, so this listing is a DRAFT and correctly
    // absent from browse — verify persistence through the detail view.)
    const detail = await request(app)
      .get(`/api/listings/${res.body.listing.id}`)
      .set('Authorization', `Bearer ${claimer.token}`);
    expect(detail.body.listing.pickupLat).toBeCloseTo(17.276);
    expect(detail.body.listing.pickupLng).toBeCloseTo(74.184);
  });

  it('rejects out-of-range and unpaired coordinates (422)', async () => {
    const base = {
      foodName: 'Bad Coords', foodDetails: 'x', category: 'BAKERY',
      dietaryType: 'VEG', portionType: 'PACKETS', totalPortions: 5,
      pickupLocationText: 'Somewhere',
      cookedAt: new Date(Date.now() - 3600e3).toISOString(),
      collectionDeadline: new Date(Date.now() + 3600e3).toISOString(),
      checklistItems: [],
    };
    for (const extra of [
      { pickupLat: 91, pickupLng: 74 },
      { pickupLat: 17, pickupLng: -181 },
      { pickupLat: 17.276 },
      { pickupLng: 74.184 },
    ]) {
      const res = await request(app)
        .post('/api/listings')
        .set('Authorization', `Bearer ${provider.token}`)
        .send({ ...base, ...extra });
      expect(res.status).toBe(422);
    }
  });

  it('listings without coordinates keep null (distance unavailable, not zero)', async () => {
    const { res } = { res: await createListing(app, request, provider.token, {}) };
    expect(res.status).toBe(201);
    expect(res.body.listing.pickupLat ?? null).toBeNull();
    expect(res.body.listing.pickupLng ?? null).toBeNull();
  });
});
