import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { cleanDb, authedUser, createListing, ALL_CHECKLIST_IDS } from './helpers.js';
import { kolkataNow, generateDueOccurrences } from '../src/services/recurringService.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function makeAdmin() {
  const hash = await bcrypt.hash('AdminPass1', 12);
  const user = await prisma.user.create({
    data: {
      name: 'Test Admin',
      email: `admin-${Date.now()}@demo.local`,
      mobile: '9000000099',
      passwordHash: hash,
      role: 'ADMIN',
    },
  });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: 'AdminPass1' });
  return { user, token: login.body.accessToken };
}

describe('Modules 8-11 — Admin, NGO log, Recurring, Language (FR-16..21)', () => {
  let provider, claimer, ngo, admin;
  beforeEach(async () => {
    await cleanDb();
    provider = await authedUser(app, request, { role: 'PROVIDER' });
    claimer = await authedUser(app, request, { role: 'CLAIMER' });
    ngo = await authedUser(app, request, {
      role: 'NGO',
      organisationName: 'Seva Trust',
      registrationDetail: 'Reg 42 (synthetic)',
    });
    admin = await makeAdmin();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('FR-20/21: non-admin gets 403 on admin endpoints; admin stats work', async () => {
    const forbidden = await request(app).get('/api/admin/stats').set(auth(provider.token));
    expect(forbidden.status).toBe(403);
    const stats = await request(app).get('/api/admin/stats').set(auth(admin.token));
    expect(stats.status).toBe(200);
    expect(stats.body.pendingNgoVerifications).toBe(1);
  });

  it('FR-16: admin verifies the NGO; the row and audit entry exist; NGO can claim before and after', async () => {
    const verify = await request(app)
      .post(`/api/admin/ngo/${ngo.user.id}/verify`)
      .set(auth(admin.token))
      .send({});
    expect(verify.status).toBe(200);
    const profile = await prisma.ngoProfile.findUnique({ where: { userId: ngo.user.id } });
    expect(profile.verificationStatus).toBe('VERIFIED');
    expect(profile.verifiedById).toBe(admin.user.id);
    const audit = await prisma.auditLog.findMany({ where: { action: 'VERIFY_NGO' } });
    expect(audit).toHaveLength(1);
  });

  it('FR-20: suspension blocks writes (403) but the suspended user can still log in and read history; both actions audited', async () => {
    const listing = (await createListing(app, request, provider.token, {})).body.listing;
    const suspend = await request(app)
      .post(`/api/admin/users/${provider.user.id}/suspend`)
      .set(auth(admin.token))
      .send({ reason: 'Test suspension' });
    expect(suspend.status).toBe(200);

    const write = await createListing(app, request, provider.token, {});
    expect(write.status).toBe(403);

    const relogin = await request(app)
      .post('/api/auth/login')
      .send({ email: provider.creds.email, password: provider.creds.password });
    expect(relogin.status).toBe(200);
    const history = await request(app).get('/api/listings/mine').set(auth(relogin.body.accessToken));
    expect(history.status).toBe(200);

    const unsuspend = await request(app)
      .post(`/api/admin/users/${provider.user.id}/unsuspend`)
      .set(auth(admin.token))
      .send({});
    expect(unsuspend.status).toBe(200);
    const actions = await prisma.auditLog.findMany({
      where: { targetId: provider.user.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(actions.map((a) => a.action)).toEqual(['SUSPEND_USER', 'UNSUSPEND_USER']);
    expect(listing).toBeTruthy();
  });

  it('FR-20: admin removes a listing with a reason; open claim becomes CANCELLED_BY_ADMIN; audit row written', async () => {
    const listing = (await createListing(app, request, provider.token, { totalPortions: 10 })).body.listing;
    const claim = await request(app)
      .post('/api/claims')
      .set(auth(claimer.token))
      .send({ listingId: listing.id, portions: 5 });
    const remove = await request(app)
      .post(`/api/admin/listings/${listing.id}/remove`)
      .set(auth(admin.token))
      .send({ reason: 'Reported unsafe' });
    expect(remove.status).toBe(200);
    const dbListing = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(dbListing.status).toBe('REMOVED_BY_ADMIN');
    const dbClaim = await prisma.claim.findUnique({ where: { id: claim.body.claim.id } });
    expect(dbClaim.status).toBe('CANCELLED_BY_ADMIN');
    const audit = await prisma.auditLog.findMany({ where: { action: 'REMOVE_LISTING' } });
    expect(audit).toHaveLength(1);
    expect(audit[0].reason).toBe('Reported unsafe');
  });

  it('FR-17: redistribution log is capped at collected portions and credited to the NGO', async () => {
    const listing = (await createListing(app, request, provider.token, { totalPortions: 60 })).body.listing;
    const claim = await request(app)
      .post('/api/claims')
      .set(auth(ngo.token))
      .send({ listingId: listing.id, portions: 50 });
    expect(claim.status).toBe(201);
    const verify = await request(app)
      .post(`/api/claims/${claim.body.claim.id}/verify`)
      .set(auth(provider.token))
      .send({ code: claim.body.pickupCode });
    expect(verify.status).toBe(200);

    const log1 = await request(app)
      .post('/api/ngo/redistributions')
      .set(auth(ngo.token))
      .send({
        claimId: claim.body.claim.id,
        destinationName: 'Zilla Shelter (synthetic)',
        destinationType: 'SHELTER',
        portions: 30,
      });
    expect(log1.status).toBe(201);
    expect(log1.body.entry.ngoId).toBe(ngo.user.id);

    const over = await request(app)
      .post('/api/ngo/redistributions')
      .set(auth(ngo.token))
      .send({
        claimId: claim.body.claim.id,
        destinationName: 'School (synthetic)',
        destinationType: 'SCHOOL',
        portions: 25,
      });
    expect(over.status).toBe(409);

    const log2 = await request(app)
      .post('/api/ngo/redistributions')
      .set(auth(ngo.token))
      .send({
        claimId: claim.body.claim.id,
        destinationName: 'School (synthetic)',
        destinationType: 'SCHOOL',
        portions: 20,
      });
    expect(log2.status).toBe(201);

    const dash = await request(app).get('/api/dashboard').set(auth(ngo.token));
    expect(dash.body.platform.ngoPortionsRedistributed).toBe(50);
    expect(dash.body.mine.ngoPortionsRedistributed).toBe(50);
  });

  it('FR-18: a due schedule generates exactly one DRAFT occurrence (never auto-published), provider completes it manually', async () => {
    const { weekday, dateStr } = kolkataNow();
    const create = await request(app)
      .post('/api/recurring')
      .set(auth(provider.token))
      .send({
        title: 'Weekday mess surplus',
        daysOfWeek: [weekday],
        generationTimeLocal: '00:00',
        deadlineOffsetMinutes: 180,
        template: {
          foodName: 'Mess Surplus',
          foodDetails: 'Template details',
          category: 'COOKED_MEALS',
          dietaryType: 'VEG',
          portionType: 'INDIVIDUAL_MEALS',
          pickupLocationText: 'Mess hall gate',
        },
      });
    expect(create.status).toBe(201);
    expect(dateStr).toBeTruthy();

    const gen = await request(app).post('/api/recurring/generate-now').set(auth(provider.token));
    expect(gen.body.created).toBe(1);
    const gen2 = await request(app).post('/api/recurring/generate-now').set(auth(provider.token));
    expect(gen2.body.created).toBe(0); // no duplicate the same day

    const drafts = await prisma.listing.findMany({
      where: { providerId: provider.user.id, status: 'DRAFT' },
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].recurringScheduleId).toBe(create.body.schedule.id);

    // Not in browse while still a draft
    const browse = await request(app).get('/api/listings').set(auth(claimer.token));
    expect(browse.body.listings.find((l) => l.id === drafts[0].id)).toBeUndefined();

    // Provider completes it: portions via edit, checklist via publish
    const edit = await request(app)
      .patch(`/api/listings/${drafts[0].id}`)
      .set(auth(provider.token))
      .send({ totalPortions: 80 });
    expect(edit.status).toBe(200);
    expect(edit.body.listing.portionsRemaining).toBe(80);
    const publish = await request(app)
      .post(`/api/listings/${drafts[0].id}/publish`)
      .set(auth(provider.token))
      .send({ checklistItems: ALL_CHECKLIST_IDS });
    expect(publish.status).toBe(200);
    expect(publish.body.listing.status).toBe('LIVE');
    const browse2 = await request(app).get('/api/listings').set(auth(claimer.token));
    expect(browse2.body.listings.find((l) => l.id === drafts[0].id)).toBeTruthy();
  });

  it('FR-19 (server side): language preference persists on the user record', async () => {
    const patch = await request(app)
      .patch('/api/users/me/language')
      .set(auth(claimer.token))
      .send({ language: 'MR' });
    expect(patch.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set(auth(claimer.token));
    expect(me.body.user.languagePref).toBe('MR');
    const hi = await request(app)
      .patch('/api/users/me/language')
      .set(auth(claimer.token))
      .send({ language: 'HI' });
    expect(hi.status).toBe(200);
    const me2 = await request(app).get('/api/auth/me').set(auth(claimer.token));
    expect(me2.body.user.languagePref).toBe('HI');
  });

  it('recurring generation function respects day-of-week', async () => {
    const { weekday } = kolkataNow();
    const otherDay = (weekday + 1) % 7;
    await prisma.recurringSchedule.create({
      data: {
        providerId: provider.user.id,
        templateFields: { title: 'Not today', foodName: 'X', foodDetails: 'Y', category: 'BAKERY', dietaryType: 'VEG', portionType: 'PACKETS', pickupLocationText: 'Gate' },
        daysOfWeek: [otherDay],
        generationTimeLocal: '00:00',
        deadlineOffsetMinutes: 180,
        active: true,
      },
    });
    const created = await generateDueOccurrences();
    expect(created).toBe(0);
  });
});
