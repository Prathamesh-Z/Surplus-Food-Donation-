/**
 * PRD v3.13 — live donor location sharing.
 * Claim-scoped authorization, coordinate validation, the
 * waiting/live/stale/stopped/inactive state machine, overwrite-only
 * storage, and the purge job's safety property (it can never delete
 * an active CONFIRMED claim's row).
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { cleanDb, authedUser, createListing } from './helpers.js';
import { purgeLiveLocations } from '../src/services/liveLocationService.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const POINT = { lat: 17.276, lng: 74.184 };
const POINT2 = { lat: 17.31, lng: 74.22 };

describe('PRD v3.13 — live location sharing', () => {
  let provider, otherProvider, claimer, stranger;
  beforeEach(async () => {
    await cleanDb();
    provider = await authedUser(app, request, { role: 'PROVIDER' });
    otherProvider = await authedUser(app, request, { role: 'PROVIDER' });
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
      .send({ listingId: listing.id, portions: 5 });
    expect(claim.status).toBe(201);
    return { listing, claimId: claim.body.claim.id, code: claim.body.pickupCode };
  }

  const publish = (token, id, body = POINT) =>
    request(app).post(`/api/claims/${id}/location`).set(auth(token)).send(body);
  const read = (token, id) => request(app).get(`/api/claims/${id}/location`).set(auth(token));
  const stop = (token, id) => request(app).delete(`/api/claims/${id}/location`).set(auth(token));

  it('publish by the owning donor → claimer reads state=live with the coordinates', async () => {
    const { claimId } = await confirmedClaim();
    const pub = await publish(provider.token, claimId);
    expect(pub.status).toBe(200);
    const res = await read(claimer.token, claimId);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('live');
    expect(res.body.lat).toBeCloseTo(POINT.lat);
    expect(res.body.lng).toBeCloseTo(POINT.lng);
    expect(res.body.updatedAt).toBeTruthy();
  });

  it('before any publish the state is waiting, with no coordinates', async () => {
    const { claimId } = await confirmedClaim();
    const res = await read(claimer.token, claimId);
    expect(res.body.state).toBe('waiting');
    expect(res.body.lat).toBeNull();
    expect(res.body.lng).toBeNull();
  });

  it('publishing overwrites: one row, latest point only (no history)', async () => {
    const { claimId } = await confirmedClaim();
    await publish(provider.token, claimId, POINT);
    await publish(provider.token, claimId, POINT2);
    const rows = await prisma.liveLocation.findMany({ where: { claimId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].lat).toBeCloseTo(POINT2.lat);
    const res = await read(claimer.token, claimId);
    expect(res.body.lat).toBeCloseTo(POINT2.lat);
  });

  it('only the owning donor may publish: claimer 403, other provider 404', async () => {
    const { claimId } = await confirmedClaim();
    expect((await publish(claimer.token, claimId)).status).toBe(403);
    expect((await publish(otherProvider.token, claimId)).status).toBe(404);
    expect((await publish(stranger.token, claimId)).status).toBe(403);
  });

  it('invalid coordinates are rejected 422 (out of range, missing, wrong type)', async () => {
    const { claimId } = await confirmedClaim();
    expect((await publish(provider.token, claimId, { lat: 91, lng: 0 })).status).toBe(422);
    expect((await publish(provider.token, claimId, { lat: 10 })).status).toBe(422);
    expect((await publish(provider.token, claimId, { lat: '17.2', lng: 74 })).status).toBe(422);
    // Nothing was stored by the rejected publishes.
    expect(await prisma.liveLocation.findUnique({ where: { claimId } })).toBeNull();
  });

  it('publishing on a non-CONFIRMED claim is 409', async () => {
    const { claimId } = await confirmedClaim();
    await request(app).post(`/api/claims/${claimId}/cancel`).set(auth(claimer.token)).send({});
    expect((await publish(provider.token, claimId)).status).toBe(409);
  });

  it('reads are participant-only: unrelated user 403, unknown claim 404, donor may read own state', async () => {
    const { claimId } = await confirmedClaim();
    await publish(provider.token, claimId);
    expect((await read(stranger.token, claimId)).status).toBe(403);
    expect((await read(otherProvider.token, claimId)).status).toBe(403);
    const own = await read(provider.token, claimId);
    expect(own.status).toBe(200);
    expect(own.body.state).toBe('live');
    const missing = await read(claimer.token, '00000000-0000-4000-8000-000000000000');
    expect(missing.status).toBe(404);
  });

  it('stop nulls the coordinates and reads back as stopped; only the owner may stop', async () => {
    const { claimId } = await confirmedClaim();
    await publish(provider.token, claimId);
    expect((await stop(otherProvider.token, claimId)).status).toBe(404);
    expect((await stop(provider.token, claimId)).status).toBe(200);
    const res = await read(claimer.token, claimId);
    expect(res.body.state).toBe('stopped');
    expect(res.body.lat).toBeNull();
    expect(res.body.lng).toBeNull();
    const row = await prisma.liveLocation.findUnique({ where: { claimId } });
    expect(row.active).toBe(false);
    expect(row.lat).toBeNull();
  });

  it('a point older than 60 s reads as stale (still shown, never as live)', async () => {
    const { claimId } = await confirmedClaim();
    await publish(provider.token, claimId);
    await prisma.liveLocation.update({
      where: { claimId },
      data: { updatedAt: new Date(Date.now() - 90_000) },
    });
    const res = await read(claimer.token, claimId);
    expect(res.body.state).toBe('stale');
    expect(res.body.lat).toBeCloseTo(POINT.lat);
  });

  it('after collection the state is inactive with no coordinates, and the purge removes the row', async () => {
    const { claimId, code } = await confirmedClaim();
    await publish(provider.token, claimId);
    const verify = await request(app)
      .post(`/api/claims/${claimId}/verify`)
      .set(auth(provider.token))
      .send({ code });
    expect(verify.status).toBe(200);
    const res = await read(claimer.token, claimId);
    expect(res.body.state).toBe('inactive');
    expect(res.body.lat).toBeNull();
    await purgeLiveLocations();
    expect(await prisma.liveLocation.findUnique({ where: { claimId } })).toBeNull();
  });

  it('purge safety: rows of active CONFIRMED claims are never deleted', async () => {
    const a = await confirmedClaim();
    await publish(provider.token, a.claimId);
    const b = await confirmedClaim();
    await publish(provider.token, b.claimId);
    // Collect only claim B, then purge.
    await request(app)
      .post(`/api/claims/${b.claimId}/verify`)
      .set(auth(provider.token))
      .send({ code: b.code });
    const removed = await purgeLiveLocations();
    expect(removed).toBe(1);
    const surviving = await prisma.liveLocation.findUnique({ where: { claimId: a.claimId } });
    expect(surviving).not.toBeNull();
    expect(surviving.active).toBe(true);
    const res = await read(claimer.token, a.claimId);
    expect(res.body.state).toBe('live');
  });
});
