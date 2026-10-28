/**
 * v3.4 — Donor contact: profile endpoint, listing prefill, privacy rules.
 * Rules under test:
 *  - PATCH /api/users/me/contact updates ONLY the caller's own number,
 *    validates the Indian format, and rejects numbers owned by others (409).
 *  - Creating a listing defaults contactPhone to the donor's saved mobile.
 *  - The phone number NEVER appears in browse/list responses.
 *  - On the detail view it appears only when the donor opted in
 *    (showContact) — or to the donor themself.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { authedUser, cleanDb, createListing } from './helpers.js';

const app = createApp();

describe('v3.4 — donor contact management', () => {
  let provider; let claimer; let otherProvider;
  beforeAll(async () => {
    await prisma.$connect();
    await cleanDb();
    provider = await authedUser(app, request, { role: 'PROVIDER' });
    claimer = await authedUser(app, request, { role: 'CLAIMER' });
    otherProvider = await authedUser(app, request, { role: 'PROVIDER' });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('profile: user updates their own contact number', async () => {
    const res = await request(app)
      .patch('/api/users/me/contact')
      .set('Authorization', `Bearer ${provider.token}`)
      .send({ mobile: '9812345678' });
    expect(res.status).toBe(200);
    expect(res.body.mobile).toBe('9812345678');
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${provider.token}`);
    expect(me.body.user.mobile).toBe('9812345678');
  });

  it('profile: invalid numbers are rejected (422)', async () => {
    for (const mobile of ['12345', '1234567890', 'abcdefghij', '98123456789']) {
      const res = await request(app)
        .patch('/api/users/me/contact')
        .set('Authorization', `Bearer ${provider.token}`)
        .send({ mobile });
      expect(res.status).toBe(422);
    }
  });

  it("profile: cannot take another user's number (409), and cannot edit unauthenticated (401)", async () => {
    const dup = await request(app)
      .patch('/api/users/me/contact')
      .set('Authorization', `Bearer ${otherProvider.token}`)
      .send({ mobile: '9812345678' });
    expect(dup.status).toBe(409);
    const anon = await request(app).patch('/api/users/me/contact').send({ mobile: '9812345678' });
    expect(anon.status).toBe(401);
    // otherProvider's own number is unchanged
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${otherProvider.token}`);
    expect(me.body.user.mobile).not.toBe('9812345678');
  });

  it('listing: contact defaults to the saved profile mobile; hidden in browse, shown on detail only with opt-in', async () => {
    const res = await createListing(app, request, provider.token, {});
    expect(res.status).toBe(201);
    const listing = res.body.listing;
    // owner sees their own contact in the create response
    expect(listing.donorContact).toBe('9812345678');
    expect(listing.showContact).toBe(false);
    expect(listing.contactPhone).toBeUndefined();

    // browse list: no contact for the claimer
    const browse = await request(app).get('/api/listings').set('Authorization', `Bearer ${claimer.token}`);
    const inBrowse = browse.body.listings.find((l) => l.id === listing.id);
    expect(inBrowse.donorContact).toBeUndefined();
    expect(inBrowse.contactPhone).toBeUndefined();

    // detail without opt-in: claimer still cannot see it
    const detail = await request(app)
      .get(`/api/listings/${listing.id}`)
      .set('Authorization', `Bearer ${claimer.token}`);
    expect(detail.body.listing.donorContact).toBeUndefined();

    // donor opts in → detail reveals it to authenticated viewers
    const edit = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set('Authorization', `Bearer ${provider.token}`)
      .send({ showContact: true });
    expect(edit.status).toBe(200);
    const detail2 = await request(app)
      .get(`/api/listings/${listing.id}`)
      .set('Authorization', `Bearer ${claimer.token}`);
    expect(detail2.body.listing.donorContact).toBe('9812345678');
    // …but browse still never exposes it
    const browse2 = await request(app).get('/api/listings').set('Authorization', `Bearer ${claimer.token}`);
    expect(browse2.body.listings.find((l) => l.id === listing.id).donorContact).toBeUndefined();
  });

  it('listing: per-listing contact override validates format', async () => {
    const bad = await createListing(app, request, provider.token, { contactPhone: '123' });
    expect(bad.status).toBe(422);
    const good = await createListing(app, request, provider.token, {
      contactPhone: '9898989898', showContact: true,
    });
    expect(good.status).toBe(201);
    expect(good.body.listing.donorContact).toBe('9898989898');
  });
});
