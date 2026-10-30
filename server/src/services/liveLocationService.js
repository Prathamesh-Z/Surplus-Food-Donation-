import { prisma } from '../lib/prisma.js';

/**
 * Live donor location (PRD v3.13).
 *
 * Privacy shape, by construction:
 * - ONE row per claim (LiveLocation.claimId is the primary key): a
 *   publish overwrites the previous point, so no history can exist.
 * - Only the claim's donor may publish/stop; only the claim's two
 *   participants may read (enforced in the routes).
 * - Stopping NULLS the coordinates — a stopped share leaves no point
 *   behind that could be mistaken for a current one.
 * - A point older than the stale threshold is reported as 'stale',
 *   never as live. Rows whose claim leaves CONFIRMED are purged by
 *   the 60-second job (purgeLiveLocations below), which by
 *   construction cannot touch an active CONFIRMED claim's row.
 */
export const LIVE_STALE_MS = 60_000;

export async function publishLiveLocation(claimId, { lat, lng }) {
  return prisma.liveLocation.upsert({
    where: { claimId },
    create: { claimId, lat, lng, active: true },
    update: { lat, lng, active: true },
  });
}

export async function stopLiveLocation(claimId) {
  return prisma.liveLocation.upsert({
    where: { claimId },
    create: { claimId, lat: null, lng: null, active: false },
    update: { lat: null, lng: null, active: false },
  });
}

/** Pure state computation so routes and tests share one definition. */
export function liveLocationState(claimStatus, row, nowMs = Date.now()) {
  const base = { lat: null, lng: null, updatedAt: row?.updatedAt ?? null };
  if (claimStatus !== 'CONFIRMED') return { state: 'inactive', ...base };
  if (!row) return { state: 'waiting', ...base };
  if (!row.active) return { state: 'stopped', ...base };
  const age = nowMs - new Date(row.updatedAt).getTime();
  return age <= LIVE_STALE_MS
    ? { state: 'live', lat: row.lat, lng: row.lng, updatedAt: row.updatedAt }
    : { state: 'stale', lat: row.lat, lng: row.lng, updatedAt: row.updatedAt };
}

/**
 * Job hook: delete live-location rows for claims that are no longer
 * CONFIRMED (collected, cancelled, expired). The filter is the safety
 * property — an active CONFIRMED claim's row can never match it.
 */
export async function purgeLiveLocations() {
  const { count } = await prisma.liveLocation.deleteMany({
    where: { claim: { status: { not: 'CONFIRMED' } } },
  });
  return count;
}
