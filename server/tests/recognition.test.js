/**
 * PRD v3.3 — POST /api/listings/recognize.
 * Uses a STUB inference HTTP service (no real model): verifies auth, role,
 * upload validation, response shaping incl. description enrichment and
 * separate specialist scores, uncertainty passthrough, and honest 503s when
 * the model/service is unavailable. Model accuracy itself is covered by the
 * evaluation in docs/RECOGNITION_EVAL.md, not by unit tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { authedUser, cleanDb } from './helpers.js';

const app = createApp();
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(64).fill(7)]);

let mode = 'ok';
let stub;
function stubHandler(req, res) {
  if (mode === 'err503') {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Primary recognition model is not loaded.' }));
  }
  if (mode === 'uncertain') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      featured: { source: 'primary', label: 'poha', score: 0.21 },
      primary: { model: 'dima806/indian_food_image_detection', top: [
        { label: 'poha', score: 0.21 }, { label: 'sheera', score: 0.18 },
      ] },
      specialist: { model: 'therealcyberlord/vit-indian-food', top: [
        { label: 'dosa', score: 0.44 },
      ] },
      specialist_ran: true, uncertain: true, latency_ms: 812,
    }));
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({
    featured: { source: 'primary', label: 'poha', score: 0.91 },
    primary: { model: 'dima806/indian_food_image_detection', top: [
      { label: 'poha', score: 0.91 }, { label: 'jalebi', score: 0.03 }, { label: 'kachori', score: 0.02 },
    ] },
    specialist: null, specialist_ran: false, uncertain: false, latency_ms: 640,
  }));
}

describe('PRD v3.3 — food recognition endpoint', () => {
  let provider; let claimer;
  beforeAll(async () => {
    await prisma.$connect();
    await cleanDb();
    provider = await authedUser(app, request, { role: 'PROVIDER' });
    claimer = await authedUser(app, request, { role: 'CLAIMER' });
    stub = http.createServer(stubHandler);
    await new Promise((r) => stub.listen(18099, '127.0.0.1', r));
  });
  afterAll(async () => {
    await new Promise((r) => stub.close(r));
    await prisma.$disconnect();
  });

  const post = (token) =>
    request(app)
      .post('/api/listings/recognize')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', JPEG, { filename: 'dish.jpg', contentType: 'image/jpeg' });

  it('401 without a token', async () => {
    const res = await request(app).post('/api/listings/recognize');
    expect(res.status).toBe(401);
  });

  it('403 for a claimer (provider-only)', async () => {
    const res = await post(claimer.token);
    expect(res.status).toBe(403);
  });

  it('400 when no image is attached', async () => {
    const res = await request(app)
      .post('/api/listings/recognize')
      .set('Authorization', `Bearer ${provider.token}`);
    expect(res.status).toBe(400);
  });

  it('400 for a non-image upload (magic-byte check)', async () => {
    const res = await request(app)
      .post('/api/listings/recognize')
      .set('Authorization', `Bearer ${provider.token}`)
      .attach('photo', Buffer.from('this is not an image at all......'), {
        filename: 'fake.jpg', contentType: 'image/jpeg',
      });
    expect(res.status).toBe(400);
  });

  it('200: enriched top prediction + alternatives, scores kept per model', async () => {
    mode = 'ok';
    const res = await post(provider.token);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.food_name).toBe('Poha');
    expect(res.body.description).toMatch(/flattened rice/);
    expect(res.body.category).toBe('COOKED_MEALS');
    expect(res.body.confidence).toBe(0.91);
    expect(res.body.uncertain).toBe(false);
    expect(res.body.alternatives.map((a) => a.name)).toEqual(['Jalebi', 'Kachori']);
    expect(res.body.specialist).toBeNull();
  });

  it('uncertain result passes through with separate specialist suggestions', async () => {
    mode = 'uncertain';
    const res = await post(provider.token);
    expect(res.status).toBe(200);
    expect(res.body.uncertain).toBe(true);
    expect(res.body.specialist.top[0].name).toBe('Dosa');
    expect(res.body.specialist.top[0].score).toBe(0.44);
    mode = 'ok';
  });

  it('503 when the inference service reports the model is not loaded', async () => {
    mode = 'err503';
    const res = await post(provider.token);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/model/i);
    mode = 'ok';
  });

  it('503 (not a fake prediction) when the inference service is down', async () => {
    await new Promise((r) => stub.close(r));
    const res = await post(provider.token);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not running/i);
    stub = http.createServer(stubHandler);
    await new Promise((r) => stub.listen(18099, '127.0.0.1', r));
  });
});
