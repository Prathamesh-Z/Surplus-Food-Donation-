/**
 * Walking/bicycle routing (PRD v3.19, batch F2) via the FOSSGIS
 * OpenStreetMap routing service (routing.openstreetmap.de).
 *
 * Why FOSSGIS and not the OSRM demo server: the public OSRM demo
 * ignores the profile in the URL and always answers with car routes
 * (verified live during analysis — identical geometry for driving,
 * foot and bike). FOSSGIS serves real per-profile routing through its
 * routed-foot / routed-bike prefixes.
 *
 * Usage policy (respected by the caller): at most ~1 request/second,
 * no bulk use — requests fire only on meaningful change (mode switch,
 * or either endpoint moving >= 50 m from the last requested route),
 * spaced by ROUTE_MIN_INTERVAL_MS, latest-wins.
 *
 * Everything here is pure — the claimer's coordinates are inputs to a
 * URL for the routing provider only, never to the app backend.
 */
import { haversineKm, validCoords } from './distance.js';

export const ROUTE_MOVE_THRESHOLD_M = 50;
export const ROUTE_MIN_INTERVAL_MS = 1100;
export const ROUTE_TIMEOUT_MS = 12_000;

const PROFILES = { foot: 'routed-foot', bike: 'routed-bike' };

/** OSRM-style route URL for the FOSSGIS profile of `mode`. */
export function routeUrl(mode, from, to) {
  const profile = PROFILES[mode] ?? PROFILES.foot;
  return (
    `https://routing.openstreetmap.de/${profile}/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
  );
}

/**
 * Parse a provider response into { coords: [[lat, lng]...],
 * distanceKm, durationSec } — or null for anything malformed
 * (non-Ok code, no route, <2 points, non-numeric/out-of-range
 * coordinates, missing distance/duration). GeoJSON order is
 * [lng, lat]; Leaflet wants [lat, lng].
 */
export function parseRouteResponse(json) {
  if (!json || json.code !== 'Ok' || !Array.isArray(json.routes) || json.routes.length === 0) {
    return null;
  }
  const route = json.routes[0];
  const raw = route?.geometry?.coordinates;
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const coords = [];
  for (const pair of raw) {
    if (!Array.isArray(pair) || pair.length < 2) return null;
    const [lng, lat] = pair;
    if (!validCoords({ lat, lng })) return null;
    coords.push([lat, lng]);
  }
  const { distance, duration } = route;
  if (typeof distance !== 'number' || !(distance >= 0)) return null;
  if (typeof duration !== 'number' || !(duration >= 0)) return null;
  return { coords, distanceKm: distance / 1000, durationSec: duration };
}

/**
 * Should a new route be requested? `last`/`next` are descriptors
 * { mode, oLat, oLng, dLat, dLng } — last = the descriptor of the most
 * recently issued request (null before the first). True when there is
 * no last request, the mode changed, or either endpoint moved at
 * least ROUTE_MOVE_THRESHOLD_M from the last requested position.
 * Identical repeat polls therefore never re-request.
 */
export function shouldRequestRoute(last, next) {
  if (!next || !validCoords({ lat: next.oLat, lng: next.oLng }) || !validCoords({ lat: next.dLat, lng: next.dLng })) {
    return false;
  }
  if (!last) return true;
  if (last.mode !== next.mode) return true;
  const movedOrigin = haversineKm(last.oLat, last.oLng, next.oLat, next.oLng);
  if (movedOrigin !== null && movedOrigin * 1000 >= ROUTE_MOVE_THRESHOLD_M) return true;
  const movedDest = haversineKm(last.dLat, last.dLng, next.dLat, next.dLng);
  if (movedDest !== null && movedDest * 1000 >= ROUTE_MOVE_THRESHOLD_M) return true;
  return false;
}

/** Milliseconds to wait before the next request is allowed (0 = now). */
export function msUntilRouteAllowed(lastFetchAt, now) {
  if (!lastFetchAt) return 0;
  return Math.max(0, ROUTE_MIN_INTERVAL_MS - (now - lastFetchAt));
}

/** Provider duration, formatted from the response value — never an
 *  invented speed estimate: "38 min", "1 h 5 min", "< 1 min". */
export function formatDuration(durationSec) {
  const mins = Math.round(durationSec / 60);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
