/**
 * v3.8 — voice search transcription endpoint (local Whisper proxy).
 * The Python service is stubbed through the service's test transport;
 * the REAL model was verified separately against a speech sample
 * (docs/PRD.md v3.8 note / RECOGNITION_EVAL-style check).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { authedUser, cleanDb } from './helpers.js';
import { __setSpeechTransportForTests } from '../src/services/speechService.js';

const app = createApp();
let claimer;

describe('v3.8 — POST /api/speech/transcribe', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanDb();
    claimer = await authedUser(app, request, { role: 'CLAIMER' });
    __setSpeechTransportForTests(async (buffer, { language }) => ({
      text: language === 'mr' ? 'पोहा' : 'poha',
      language: language ?? 'en',
      latency_ms: 42,
    }));
  });
  afterAll(async () => {
    __setSpeechTransportForTests(null);
    await prisma.$disconnect();
  });

  it('requires auth', async () => {
    const res = await request(app)
      .post('/api/speech/transcribe')
      .attach('audio', Buffer.from('fake'), 'voice.webm');
    expect(res.status).toBe(401);
  });

  it('returns the transcript and passes the language hint through', async () => {
    const res = await request(app)
      .post('/api/speech/transcribe')
      .set('Authorization', `Bearer ${claimer.token}`)
      .field('language', 'mr')
      .attach('audio', Buffer.from('fake-audio'), 'voice.webm');
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('पोहा');
    expect(res.body.language).toBe('mr');
  });

  it('rejects a request with no audio', async () => {
    const res = await request(app)
      .post('/api/speech/transcribe')
      .set('Authorization', `Bearer ${claimer.token}`)
      .field('language', 'en');
    expect(res.status).toBe(400);
  });

  it('surfaces the honest 503 when the speech service is down', async () => {
    __setSpeechTransportForTests(async () => {
      const err = new Error('Speech service is not running.');
      err.status = 503;
      throw err;
    });
    const res = await request(app)
      .post('/api/speech/transcribe')
      .set('Authorization', `Bearer ${claimer.token}`)
      .attach('audio', Buffer.from('fake'), 'voice.webm');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not running/i);
    __setSpeechTransportForTests(async () => ({ text: 'ok', language: 'en', latency_ms: 1 }));
  });
});
