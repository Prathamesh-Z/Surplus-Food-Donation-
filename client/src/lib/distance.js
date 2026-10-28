/**
 * Distance helpers (v3.5). Distances are computed ON THE DEVICE from the
 * user's saved location coordinates and each listing's pickup coordinates —
 * the user's own coordinates are never sent to the server.
 * A missing coordinate pair means "distance unavailable" (null), which is
 * never treated as zero and always sorts last.
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  if (
    [lat1, lng1, lat2, lng2].some((v) => typeof v !== 'number' || Number.isNaN(v))
  ) {
    return null;
  }
  const R = 6371; // Earth radius, km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Distance from `from` ({lat,lng}) to a listing's pickup point, or null. */
export function listingDistanceKm(from, listing) {
  if (!from || typeof from.lat !== 'number' || typeof from.lng !== 'number') return null;
  if (typeof listing.pickupLat !== 'number' || typeof listing.pickupLng !== 'number') return null;
  return haversineKm(from.lat, from.lng, listing.pickupLat, listing.pickupLng);
}

/** "850 m" under 1 km, otherwise "4.2 km". */
export function formatDistance(km) {
  if (km === null || km === undefined) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}
