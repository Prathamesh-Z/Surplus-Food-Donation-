import { prisma } from '../lib/prisma.js';

export const TERMINAL_CLAIM_STATUSES = [
  'COLLECTED',
  'CANCELLED_ON_TIME',
  'CANCELLED_LATE',
  'EXPIRED',
  'CANCELLED_BY_PROVIDER',
  'CANCELLED_BY_ADMIN',
];

export const OPEN_CLAIM_STATUSES = ['CONFIRMED'];

// Fields that must be cleared whenever a claim reaches a terminal state
// (PRD FR-11): encrypted re-view copy deleted, HMAC cleared so the unique
// constraint applies only to active claims. The salted hash is also cleared.
export function clearedCodeFields() {
  return {
    pickupCodeHash: null,
    pickupCodeSalt: null,
    pickupCodeEncrypted: null,
    pickupCodeIv: null,
    pickupCodeAuthTag: null,
    pickupCodeHmac: null,
  };
}

// Sum of portions in claims that count against a listing (open + collected).
export async function claimedPortions(listingId, client = prisma) {
  const agg = await client.claim.aggregate({
    where: { listingId, status: { in: ['CONFIRMED', 'COLLECTED'] } },
    _sum: { portionsClaimed: true },
  });
  return agg._sum.portionsClaimed ?? 0;
}

// Recompute a non-terminal listing's status from its portions and claims.
export function derivedStatus({ currentStatus, totalPortions, portionsRemaining, claimedCount }) {
  if (['DRAFT', 'EXPIRED', 'CANCELLED', 'REMOVED_BY_ADMIN'].includes(currentStatus)) {
    return currentStatus;
  }
  if (portionsRemaining <= 0) return 'FULLY_CLAIMED';
  if (claimedCount > 0) return 'PARTIALLY_CLAIMED';
  return 'LIVE';
}

export async function refreshListingStatus(listingId, client = prisma) {
  const listing = await client.listing.findUnique({ where: { id: listingId } });
  if (!listing) return null;
  const claimedCount = await client.claim.count({
    where: { listingId, status: { in: ['CONFIRMED', 'COLLECTED'] } },
  });
  const status = derivedStatus({
    currentStatus: listing.status,
    totalPortions: listing.totalPortions,
    portionsRemaining: listing.portionsRemaining,
    claimedCount,
  });
  if (status !== listing.status) {
    return client.listing.update({ where: { id: listingId }, data: { status } });
  }
  return listing;
}

export function listingView(listing) {
  if (!listing) return listing;
  const { provider, ...rest } = listing;
  return {
    ...rest,
    providerName: provider?.name ?? undefined,
    providerId: listing.providerId,
  };
}
