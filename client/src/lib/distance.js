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

/** True only for a real, in-range coordinate pair. */
export function validCoords(p) {
  return (
    !!p &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180
  );
}

/** Distance from `from` ({lat,lng}) to a listing's pickup point, or null. */
export function listingDistanceKm(from, listing) {
  if (!validCoords(from)) return null;
  if (!validCoords({ lat: listing.pickupLat, lng: listing.pickupLng })) return null;
  return haversineKm(from.lat, from.lng, listing.pickupLat, listing.pickupLng);
}

/** Discovery radius for Browse (PRD v3.18, batch F4) — one place to change. */
export const BROWSE_RADIUS_KM = 5;

/**
 * The Browse radius gate. Applies ONLY to the claiming roles (CLAIMER,
 * NGO) and only when the user has real saved coordinates — otherwise
 * it is a pass-through and says so (`applied: false`), so the UI never
 * pretends filtering is on. When applied, a listing is kept only with
 * a KNOWN distance ≤ the radius: missing or invalid pickup
 * coordinates are hidden (an unknown distance is never treated as
 * zero or as "close"). Pure and client-side by design — the user's
 * coordinates are an input here, never a network payload.
 */
export function applyBrowseRadius(listings, userPos, role) {
  const scoped = role === 'CLAIMER' || role === 'NGO';
  if (!scoped || !validCoords(userPos)) {
    return { applied: false, listings, hiddenCount: 0 };
  }
  const kept = [];
  let hiddenCount = 0;
  for (const l of listings) {
    const d = listingDistanceKm(userPos, l);
    if (d !== null && d <= BROWSE_RADIUS_KM) kept.push(l);
    else hiddenCount += 1;
  }
  return { applied: true, listings: kept, hiddenCount };
}

/** "850 m" under 1 km, otherwise "4.2 km". */
export function formatDistance(km) {
  if (km === null || km === undefined) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}
