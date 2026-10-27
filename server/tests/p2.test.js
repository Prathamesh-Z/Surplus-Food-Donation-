import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { cleanDb, authedUser, createListing } from './helpers.js';
import { __setEmailTransportForTests, sendEmail } from '../src/services/emailService.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('Module 12 — CSV export (FR-23) & email mirror (FR-24)', () => {
  let provider, claimer, ngo;
  beforeEach(async () => {
    await cleanDb();
    __setEmailTransportForTests(null);
    provider = await authedUser(app, request, { role: 'PROVIDER' });
    claimer = await authedUser(app, request, { role: 'CLAIMER' });
    ngo = await authedUser(app, request, {
      role: 'NGO',
      organisationName: 'Test NGO',
      registrationDetail: 'Reg (synthetic)',
    });
  });
  afterAll(async () => {
    __setEmailTransportForTests(null);
    await prisma.$disconnect();
  });

  it('FR-23: CSV export carries the same figures as the dashboard, plus provider listing rows', async () => {
    await createListing(app, request, provider.token, { totalPortions: 40 });
    const res = await request(app).get('/api/dashboard/export.csv').set(auth(provider.token));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('platform,portionsListed,40');
    expect(res.text).toContain('platform,listingsCreated,1');
    expect(res.text).toContain('Cooked Rice & Dal');
  });

  it('FR-24: with a mail transport configured, a new-listing event also produces email to claimers/NGOs — in-app row is still created', async () => {
    const sent = [];
    __setEmailTransportForTests(async (msg) => {
      sent.push(msg);
      return { sent: true };
    });
    await createListing(app, request, provider.token, {});
    // Email mirroring is fire-and-forget; give it a tick.
    await new Promise((r) => setTimeout(r, 50));
    const recipients = sent.map((m) => m.to).sort();
    expect(recipients).toEqual([claimer.creds.email, ngo.creds.email].sort());
    const notes = await prisma.notification.count({ where: { type: 'NEW_LISTING' } });
    expect(notes).toBe(2);
  });

  it('FR-24: with no SMTP configured, sendEmail is a safe no-op and events still succeed', async () => {
    __setEmailTransportForTests(null);
    const result = await sendEmail({ to: 'x@example.local', subject: 's', text: 't' });
    expect(result.skipped).toBe(true);
    const res = await createListing(app, request, provider.token, {});
    expect(res.status).toBe(201);
  });
});
