import { prisma } from '../lib/prisma.js';
import { clearedCodeFields } from './listingService.js';
import { createNotification } from './notificationService.js';

// PRD FR-13 / FR-14 — one expiry pass. Exported so tests and the demo
// "run expiry now" action can invoke it directly; the scheduler runs it
// every 60 seconds.
export async function runExpiryPass(client = prisma) {
  const now = new Date();
  const summary = { listingsExpired: 0, claimsExpired: 0, nearDeadlineSent: 0 };

  // 1) Expire listings past deadline, with their still-open claims.
  const expiring = await client.listing.findMany({
    where: {
      status: { in: ['LIVE', 'PARTIALLY_CLAIMED', 'FULLY_CLAIMED'] },
      collectionDeadline: { lte: now },
    },
    include: { claims: { where: { status: 'CONFIRMED' } } },
  });
  for (const listing of expiring) {
    await client.$transaction(async (tx) => {
      await tx.listing.update({ where: { id: listing.id }, data: { status: 'EXPIRED' } });
      for (const claim of listing.claims) {
        await tx.claim.update({
          where: { id: claim.id },
          data: { status: 'EXPIRED', ...clearedCodeFields() },
        });
        await createNotification(
          {
            userId: claim.claimerId,
            type: 'CLAIM_EXPIRED',
            title: 'A claim expired uncollected',
            body: `The collection deadline for "${listing.foodName}" passed, so your claim of ${claim.portionsClaimed} portions expired.`,
            relatedListingId: listing.id,
            relatedClaimId: claim.id,
          },
          tx
        );
        summary.claimsExpired += 1;
      }
    });
    summary.listingsExpired += 1;
  }

  // 2) Near-deadline alerts — at most one per listing per threshold (flags).
  const soon60 = await client.listing.findMany({
    where: {
      status: { in: ['LIVE', 'PARTIALLY_CLAIMED'] },
      collectionDeadline: { gt: now, lte: new Date(now.getTime() + 60 * 60000) },
      nearDeadlineProviderNotifiedAt: null,
    },
  });
  for (const listing of soon60) {
    await client.$transaction(async (tx) => {
      await createNotification(
        {
          userId: listing.providerId,
          type: 'NEAR_DEADLINE_PROVIDER',
          title: 'Listing ends within the hour',
          body: `"${listing.foodName}" has ${listing.portionsRemaining} portions remaining and its deadline is ${listing.collectionDeadline.toISOString()}.`,
          relatedListingId: listing.id,
        },
        tx
      );
      await tx.listing.update({
        where: { id: listing.id },
        data: { nearDeadlineProviderNotifiedAt: now },
      });
    });
    summary.nearDeadlineSent += 1;
  }

  const soon30 = await client.listing.findMany({
    where: {
      status: { in: ['LIVE', 'PARTIALLY_CLAIMED'] },
      collectionDeadline: { gt: now, lte: new Date(now.getTime() + 30 * 60000) },
      nearDeadlineClaimersNotifiedAt: null,
    },
    include: { claims: { where: { status: 'CONFIRMED' }, select: { claimerId: true } } },
  });
  for (const listing of soon30) {
    const claimerIds = [...new Set(listing.claims.map((c) => c.claimerId))];
    const ngos = await client.user.findMany({
      where: { role: 'NGO', suspended: false },
      select: { id: true },
    });
    const recipients = [...new Set([listing.providerId, ...claimerIds, ...ngos.map((n) => n.id)])];
    await client.$transaction(async (tx) => {
      for (const userId of recipients) {
        await createNotification(
          {
            userId,
            type: 'NEAR_DEADLINE_CLAIMERS',
            title: 'Food expiring within 30 minutes',
            body: `"${listing.foodName}" — ${listing.portionsRemaining} portions left at ${listing.pickupLocationText}. Deadline ${listing.collectionDeadline.toISOString()}.`,
            relatedListingId: listing.id,
          },
          tx
        );
      }
      await tx.listing.update({
        where: { id: listing.id },
        data: { nearDeadlineClaimersNotifiedAt: now },
      });
    });
    summary.nearDeadlineSent += recipients.length;
  }

  return summary;
}
