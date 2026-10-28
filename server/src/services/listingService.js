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

/**
 * Public listing shape. `contactPhone` is NEVER spread into responses.
 * `donorContact` is added only when the viewer is the listing's provider,
 * or — on the detail view only — when the donor opted in via showContact.
 * Browse/list responses therefore never expose a phone number (v3.4).
 */
export function listingView(listing, viewerId = null, { detail = false } = {}) {
  if (!listing) return listing;
  const { provider, contactPhone, ...rest } = listing;
  const view = {
    ...rest,
    providerName: provider?.name ?? undefined,
    providerId: listing.providerId,
  };
  if (contactPhone && viewerId && (viewerId === listing.providerId || (detail && listing.showContact))) {
    view.donorContact = contactPhone;
  }
  return view;
}
