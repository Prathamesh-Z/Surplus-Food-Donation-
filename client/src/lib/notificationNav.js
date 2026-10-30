import { listingDistanceKm, validCoords, BROWSE_RADIUS_KM } from './distance.js';

/**
 * The one notification destination mapping, shared by the
 * Notifications page and the banner host (PRD v3.17) so a click lands
 * in the same place from both: a linked listing wins, then a linked
 * claim goes to My Claims, and a notification with neither has no
 * destination (null — callers must not navigate).
 */
export function notificationPath(n) {
  if (n.relatedListingId) return `/listings/${n.relatedListingId}`;
  if (n.relatedClaimId) return '/my-claims';
  return null;
}

/**
 * The 5 km discovery guard for notification click-through (PRD
 * v3.21). Browse already hides out-of-radius listings from CLAIMER
 * and NGO users; this keeps a notification from becoming a side door
 * to the same listing. It reuses the Browse rule exactly — same
 * Haversine helper, same BROWSE_RADIUS_KM, same inclusive boundary,
 * same "unknown distance is never assumed close".
 *
 * Verdicts: { action: 'allow' } or { action: 'block', reason } with
 * reason 'no-user-location' | 'no-listing-coords' | 'outside-radius'.
 * PROVIDER, ADMIN and every non-claiming role always allow — their
 * navigation behaviour is unchanged.
 */
export function radiusGuardVerdict({ role, userPos, listing }) {
  if (role !== 'CLAIMER' && role !== 'NGO') return { action: 'allow' };
  if (!validCoords(userPos)) return { action: 'block', reason: 'no-user-location' };
  if (!listing || !validCoords({ lat: listing.pickupLat, lng: listing.pickupLng })) {
    return { action: 'block', reason: 'no-listing-coords' };
  }
  const d = listingDistanceKm(userPos, listing);
  if (d === null) return { action: 'block', reason: 'no-listing-coords' };
  if (d <= BROWSE_RADIUS_KM) return { action: 'allow', distanceKm: d };
  return { action: 'block', reason: 'outside-radius', distanceKm: d };
}

/**
 * Resolve a notification click to { path } or { blocked: reason }.
 * Only listing-linked notifications for claiming roles involve the
 * guard (and one fetch of the listing's public coordinates through
 * the existing detail endpoint, supplied by the caller as
 * fetchListing); every other notification resolves exactly as
 * notificationPath() always has.
 */
export async function resolveNotificationNavigation(n, { role, userPos, fetchListing }) {
  const path = notificationPath(n);
  if (!path || !n.relatedListingId) return { path, blocked: null };
  if (role !== 'CLAIMER' && role !== 'NGO') return { path, blocked: null };
  let listing = null;
  try {
    listing = await fetchListing(n.relatedListingId);
  } catch {
    listing = null; // unfetchable => coordinates unverifiable => blocked, per rule B
  }
  const verdict = radiusGuardVerdict({ role, userPos, listing });
  if (verdict.action === 'allow') return { path, blocked: null, distanceKm: verdict.distanceKm };
  return { path: null, blocked: verdict.reason, distanceKm: verdict.distanceKm };
}

/** The i18n key for a guard block reason (components translate it). */
export function guardReasonKey(reason) {
  return (
    {
      'outside-radius': 'guardOutsideRadius',
      'no-user-location': 'guardNoUserLocation',
      'no-listing-coords': 'guardNoCoords',
    }[reason] ?? 'guardNoCoords'
  );
}
