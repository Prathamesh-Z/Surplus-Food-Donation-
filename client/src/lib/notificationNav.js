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
