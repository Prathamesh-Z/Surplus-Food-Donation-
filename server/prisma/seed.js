// Seed — SYNTHETIC demo data only (PRD: demo data is labelled synthetic).
// Creates the four demo accounts used across the PRD journeys:
//   provider@demo.local / claimer@demo.local / ngo@demo.local / admin@demo.local
//   password for all: DemoPass1
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { codeStorageFields } from '../src/services/pickupCodeService.js';
import { CHECKLIST_IDS } from '../src/lib/checklist.js';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('DemoPass1', 12);

  const provider = await prisma.user.upsert({
    where: { email: 'provider@demo.local' },
    update: {},
    create: {
      name: 'Sunita Jadhav (Demo Mess Manager)',
      email: 'provider@demo.local',
      mobile: '9000000001',
      passwordHash,
      role: 'PROVIDER',
    },
  });

  const claimer = await prisma.user.upsert({
    where: { email: 'claimer@demo.local' },
    update: {},
    create: {
      name: 'Kavita Mane (Demo Claimer)',
      email: 'claimer@demo.local',
      mobile: '9000000002',
      passwordHash,
      role: 'CLAIMER',
    },
  });

  const ngoUser = await prisma.user.upsert({
    where: { email: 'ngo@demo.local' },
    update: {},
    create: {
      name: 'Anil Pawar (Demo NGO)',
      email: 'ngo@demo.local',
      mobile: '9000000003',
      passwordHash,
      role: 'NGO',
    },
  });
  await prisma.ngoProfile.upsert({
    where: { userId: ngoUser.id },
    update: {},
    create: {
      userId: ngoUser.id,
      organisationName: 'Demo Community Food NGO',
      registrationDetail: 'Synthetic demo organisation — not a real registration.',
      verificationStatus: 'UNVERIFIED',
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.local' },
    update: {},
    create: {
      name: 'Demo Admin',
      email: 'admin@demo.local',
      mobile: '9000000004',
      passwordHash,
      role: 'ADMIN',
    },
  });

  // Synthetic demo activity (only when the DB has no listings yet): three
  // listings, two claims, one completed collection — matching the worked
  // example in the PRD so the dashboard opens with real, checkable numbers.
  const existing = await prisma.listing.count();
  if (existing === 0) {
    const now = Date.now();
    const base = {
      providerId: provider.id,
      category: 'COOKED_MEALS',
      dietaryType: 'VEG',
      portionType: 'INDIVIDUAL_MEALS',
      pickupLocationText: 'Demo College Mess, Main Gate (synthetic)',
      // Approximate Karad town coordinates so distance sorting is demoable;
      // these demo listings are synthetic, like everything in this seed.
      pickupLat: 17.276,
      pickupLng: 74.184,
      cookedAt: new Date(now - 60 * 60000),
      checklistConfirmedItems: CHECKLIST_IDS,
      checklistConfirmedAt: new Date(),
    };
    const l1 = await prisma.listing.create({
      data: {
        ...base,
        foodName: 'Demo: Cooked Rice & Dal',
        foodDetails: 'Synthetic demo listing — freshly packed mess surplus.',
        totalPortions: 100,
        portionsRemaining: 50,
        collectionDeadline: new Date(now + 150 * 60000),
        status: 'PARTIALLY_CLAIMED',
      },
    });
    await prisma.listing.create({
      data: {
        ...base,
        foodName: 'Demo: Vegetable Sabzi',
        foodDetails: 'Synthetic demo listing.',
        totalPortions: 50,
        portionsRemaining: 50,
        collectionDeadline: new Date(now + 240 * 60000),
        status: 'LIVE',
      },
    });
    await prisma.listing.create({
      data: {
        ...base,
        foodName: 'Demo: Bakery Items',
        foodDetails: 'Synthetic demo listing.',
        category: 'BAKERY',
        totalPortions: 30,
        portionsRemaining: 30,
        collectionDeadline: new Date(now + 300 * 60000),
        status: 'LIVE',
      },
    });
    const fields1 = codeStorageFields('SAMPLE88');
    await prisma.claim.create({
      data: {
        listingId: l1.id,
        claimerId: claimer.id,
        portionsClaimed: 30,
        status: 'COLLECTED',
        collectedAt: new Date(now - 30 * 60000),
      },
    });
    await prisma.claim.create({
      data: {
        listingId: l1.id,
        claimerId: ngoUser.id,
        portionsClaimed: 20,
        status: 'CONFIRMED',
        ...fields1,
      },
    });
    console.log('Seeded synthetic demo activity: 3 listings, 2 claims, 1 collection.');
  }

  console.log('Seeded synthetic demo accounts:', {
    provider: provider.email,
    claimer: claimer.email,
    ngo: ngoUser.email,
    admin: admin.email,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
