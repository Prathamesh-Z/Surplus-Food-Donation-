import { prisma } from '../src/lib/prisma.js';
import { CHECKLIST_IDS } from '../src/lib/checklist.js';

export const ALL_CHECKLIST_IDS = CHECKLIST_IDS;

let counter = 0;
export function uniqueEmail(prefix = 'user') {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@test.local`;
}
export function uniqueMobile() {
  counter += 1;
  return `98${String(10000000 + counter).slice(-8)}`;
}

export async function cleanDb() {
  // Order matters (FKs). Use TRUNCATE CASCADE for speed and determinism.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditLog","Notification","RedistributionLog","Claim","Listing","RecurringSchedule","NgoProfile","Session","User" CASCADE'
  );
}

export async function registerUser(app, request, overrides = {}) {
  const body = {
    name: overrides.name ?? 'Test User',
    email: overrides.email ?? uniqueEmail(overrides.role?.toLowerCase() ?? 'user'),
    mobile: overrides.mobile ?? uniqueMobile(),
    password: overrides.password ?? 'TestPass1',
    role: overrides.role ?? 'CLAIMER',
    ...(overrides.organisationName ? { organisationName: overrides.organisationName } : {}),
    ...(overrides.registrationDetail ? { registrationDetail: overrides.registrationDetail } : {}),
  };
  const res = await request(app).post('/api/auth/register').send(body);
  return { res, body };
}

export async function loginUser(request, app, email, password = 'TestPass1') {
  return request(app).post('/api/auth/login').send({ email, password });
}

// Register + login in one step; returns { token, user, creds }.
export async function authedUser(app, request, overrides = {}) {
  const { res, body } = await registerUser(app, request, overrides);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const login = await loginUser(request, app, body.email, body.password);
  if (login.status !== 200) throw new Error(`login failed: ${login.status}`);
  return { token: login.body.accessToken, user: login.body.user, creds: body };
}

export async function createListing(app, request, token, overrides = {}) {
  const now = Date.now();
  const body = {
    foodName: overrides.foodName ?? 'Cooked Rice & Dal',
    foodDetails: overrides.foodDetails ?? 'Fresh cooked meals from the mess',
    category: overrides.category ?? 'COOKED_MEALS',
    dietaryType: overrides.dietaryType ?? 'VEG',
    portionType: overrides.portionType ?? 'INDIVIDUAL_MEALS',
    totalPortions: overrides.totalPortions ?? 100,
    ngoSuitable: overrides.ngoSuitable ?? false,
    categoryNote: overrides.categoryNote,
    bulkUnit: overrides.bulkUnit,
    pickupLocationText: overrides.pickupLocationText ?? 'Hostel Mess Gate, Karad',
    cookedAt: overrides.cookedAt ?? new Date(now - 60 * 60 * 1000).toISOString(),
    collectionDeadline:
      overrides.collectionDeadline ?? new Date(now + 3 * 60 * 60 * 1000).toISOString(),
    checklistItems: overrides.checklistItems ?? ALL_CHECKLIST_IDS,
  };
  const req = request(app).post('/api/listings').set('Authorization', `Bearer ${token}`);
  if (overrides.photoPath) body.photoPath = overrides.photoPath;
  return req.send(body);
}
