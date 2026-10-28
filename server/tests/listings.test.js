import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { cleanDb, authedUser, createListing, ALL_CHECKLIST_IDS } from './helpers.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('Module 3 — Listings (FR-04, FR-05, FR-06)', () => {
  let provider, claimer;
  beforeEach(async () => {
    await cleanDb();
    provider = await authedUser(app, request, { role: 'PROVIDER' });
    claimer = await authedUser(app, request, { role: 'CLAIMER' });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('FR-04: creates a LIVE listing with all checklist items; remaining = total', async () => {
    const res = await createListing(app, request, provider.token, { totalPortions: 100 });
    expect(res.status).toBe(201);
    expect(res.body.listing.status).toBe('LIVE');
    expect(res.body.listing.portionsRemaining).toBe(100);
    expect(res.body.listing.category).toBe('COOKED_MEALS');
  });

  it('FR-04: validation — 0 portions, past deadline, 25h deadline, bad category -> 422', async () => {
    const zero = await createListing(app, request, provider.token, { totalPortions: 0 });
    expect(zero.status).toBe(422);

    const past = await createListing(app, request, provider.token, {
      collectionDeadline: new Date(Date.now() - 3600e3).toISOString(),
    });
    expect(past.status).toBe(422);

    const far = await createListing(app, request, provider.token, {
      collectionDeadline: new Date(Date.now() + 25 * 3600e3).toISOString(),
    });
    expect(far.status).toBe(422);

    const badCat = await request(app)
      .post('/api/listings')
      .set(auth(provider.token))
      .send({
        foodName: 'X',
        foodDetails: 'Y',
        category: 'SNACKS',
        dietaryType: 'VEG',
        portionType: 'INDIVIDUAL_MEALS',
        totalPortions: 10,
        pickupLocationText: 'Gate',
        cookedAt: new Date(Date.now() - 3600e3).toISOString(),
        collectionDeadline: new Date(Date.now() + 3600e3).toISOString(),
        checklistItems: ALL_CHECKLIST_IDS,
      });
    expect(badCat.status).toBe(422);
  });

  it('FR-04: claimer cannot create a listing -> 403', async () => {
    const res = await createListing(app, request, claimer.token, {});
    expect(res.status).toBe(403);
  });

  it('FR-05: 7 of 8 checklist items -> listing stays DRAFT and publish returns 422 naming the missing item', async () => {
    const partial = ALL_CHECKLIST_IDS.slice(0, 7);
    const res = await createListing(app, request, provider.token, { checklistItems: partial });
    expect(res.status).toBe(201);
    expect(res.body.listing.status).toBe('DRAFT');

    const publish = await request(app)
      .post(`/api/listings/${res.body.listing.id}/publish`)
      .set(auth(provider.token))
      .send({});
    expect(publish.status).toBe(422);
    expect(publish.body.missing).toEqual([ALL_CHECKLIST_IDS[7]]);

    const publishFull = await request(app)
      .post(`/api/listings/${res.body.listing.id}/publish`)
      .set(auth(provider.token))
      .send({ checklistItems: ALL_CHECKLIST_IDS });
    expect(publishFull.status).toBe(200);
    expect(publishFull.body.listing.status).toBe('LIVE');
    const db = await prisma.listing.findUnique({ where: { id: res.body.listing.id } });
    expect(db.checklistConfirmedAt).toBeTruthy();
    expect(db.checklistConfirmedItems).toHaveLength(8);
  });

  it('FR-06: provider edits portions before any claim; remaining recomputed', async () => {
    const created = await createListing(app, request, provider.token, { totalPortions: 100 });
    const id = created.body.listing.id;
    const edit = await request(app)
      .patch(`/api/listings/${id}`)
      .set(auth(provider.token))
      .send({ totalPortions: 120 });
    expect(edit.status).toBe(200);
    expect(edit.body.listing.totalPortions).toBe(120);
    expect(edit.body.listing.portionsRemaining).toBe(120);
  });

  it('FR-06: cancel requires a reason, sets CANCELLED, and cannot be repeated', async () => {
    const created = await createListing(app, request, provider.token, {});
    const id = created.body.listing.id;
    const noReason = await request(app)
      .post(`/api/listings/${id}/cancel`)
      .set(auth(provider.token))
      .send({ reason: 'x' });
    expect(noReason.status).toBe(422);

    const cancel = await request(app)
      .post(`/api/listings/${id}/cancel`)
      .set(auth(provider.token))
      .send({ reason: 'Kitchen closed early' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.listing.status).toBe('CANCELLED');
    expect(cancel.body.listing.cancelReason).toBe('Kitchen closed early');

    const again = await request(app)
      .post(`/api/listings/${id}/cancel`)
      .set(auth(provider.token))
      .send({ reason: 'Again' });
    expect(again.status).toBe(409);
  });

  it('FR-04 photo: uploads an image and rejects an oversize file with 413', async () => {
    const created = await createListing(app, request, provider.token, {});
    const id = created.body.listing.id;
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e221bc330000000049454e44ae426082',
      'hex'
    );
    const ok = await request(app)
      .post(`/api/listings/${id}/photo`)
      .set(auth(provider.token))
      .attach('photo', png, { filename: 'food.png', contentType: 'image/png' });
    expect(ok.status).toBe(200);
    expect(ok.body.photoPath).toMatch(/^\/uploads\/.+\.png$/);

    // Regression (v3.5): the uploaded file must actually be SERVED at its
    // URL — multer's write directory and the static /uploads mount once
    // resolved to different folders, so every photo 404'd in the browser.
    const served = await request(app).get(ok.body.photoPath);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toMatch(/image\/png/);

    const big = Buffer.alloc(6 * 1024 * 1024, 1);
    const tooBig = await request(app)
      .post(`/api/listings/${id}/photo`)
      .set(auth(provider.token))
      .attach('photo', big, { filename: 'big.png', contentType: 'image/png' });
    expect(tooBig.status).toBe(413);
  });
});

describe('v3.2 amendments — category note & bulk unit', () => {
  let provider;
  beforeEach(async () => {
    await cleanDb();
    provider = await authedUser(app, request, { role: 'PROVIDER' });
  });

  it('category OTHER stores the free-text note; non-OTHER clears it', async () => {
    const res = await createListing(app, request, provider.token, {
      category: 'OTHER',
      categoryNote: 'Sweets & snacks',
    });
    expect(res.status).toBe(201);
    expect(res.body.listing.categoryNote).toBe('Sweets & snacks');
    const res2 = await createListing(app, request, provider.token, {
      category: 'BAKERY',
      categoryNote: 'should be ignored',
    });
    expect(res2.body.listing.categoryNote).toBeNull();
  });

  it('BULK_SERVINGS stores the sub-unit; other portion types clear it', async () => {
    const res = await createListing(app, request, provider.token, {
      portionType: 'BULK_SERVINGS',
      bulkUnit: 'KILOGRAMS',
      totalPortions: 40,
    });
    expect(res.status).toBe(201);
    expect(res.body.listing.bulkUnit).toBe('KILOGRAMS');
    const res2 = await createListing(app, request, provider.token, { bulkUnit: 'LITRES' });
    expect(res2.body.listing.bulkUnit).toBeNull();
  });
});
