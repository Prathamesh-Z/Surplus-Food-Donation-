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
  // Waypoints (audit Fix 4): the provider's response carries the
  // SNAPPED point it actually routed from/to, plus its own snap
  // distance in metres. Extracted verbatim when present and valid;
  // missing or malformed waypoint data yields nulls and NEVER
  // invalidates an otherwise valid route. Geometry endpoints are not
  // a substitute and are never presented as snapped points.
  let snappedOrigin = null;
  let snappedDestination = null;
  let snapOriginM = null;
  let snapDestM = null;
  if (Array.isArray(json.waypoints) && json.waypoints.length >= 2) {
    const first = parseWaypoint(json.waypoints[0]);
    const last = parseWaypoint(json.waypoints[json.waypoints.length - 1]);
    snappedOrigin = first.point;
    snapOriginM = first.snapM;
    snappedDestination = last.point;
    snapDestM = last.snapM;
  }
  return {
    coords,
    distanceKm: distance / 1000,
    durationSec: duration,
    snappedOrigin,
    snappedDestination,
    snapOriginM,
    snapDestM,
  };
}

/** One waypoint -> { point: {lat, lng} | null, snapM: number | null },
 *  each field validated independently; anything malformed is null. */
function parseWaypoint(w) {
  if (!w || !Array.isArray(w.location) || w.location.length < 2) {
    return { point: null, snapM: null };
  }
  const [lng, lat] = w.location;
  return {
    point: validCoords({ lat, lng }) ? { lat, lng } : null,
    snapM: typeof w.distance === 'number' && w.distance >= 0 ? w.distance : null,
  };
}

/**
 * Build one diagnostic record for a route request (audit Fix 4).
 * Pure; developer diagnostics only. `request` is the REQUEST-TIME
 * descriptor values { mode, from, to } — never later component state.
 * `result` is { ok: true, parsed } or { ok: false, failure } with
 * failure 'timeout' | 'network' | 'bad-response'. Failed records
 * carry null route distance/duration — nothing is fabricated.
 * Snap displacement is reported two ways that cross-check: the
 * provider's own waypoint distance (snapProviderM) and an independent
 * haversine between the requested and snapped points (snapComputedM),
 * the latter only when both points genuinely exist.
 */
export function buildRouteDiagnostics(request, result, nowMs = Date.now()) {
  const { mode, from, to } = request;
  const ok = !!result?.ok;
  const parsed = ok ? result.parsed : null;
  const straightKm = haversineKm(from?.lat, from?.lng, to?.lat, to?.lng);
  const round = (v, dp) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** dp) / 10 ** dp : null);
  const endpoint = (requested, snapped, snapProviderM) => ({
    requested: requested ? { lat: requested.lat, lng: requested.lng } : null,
    snapped: snapped ?? null,
    snapProviderM: round(snapProviderM, 1),
    snapComputedM: snapped && requested ? round(haversineKm(requested.lat, requested.lng, snapped.lat, snapped.lng) * 1000, 1) : null,
  });
  return {
    profile: mode,
    provider: `routing.openstreetmap.de/${mode === 'bike' ? 'routed-bike' : 'routed-foot'}`,
    requestedAt: new Date(nowMs).toISOString(),
    status: ok ? 'ok' : 'unavailable',
    failure: ok ? null : (result?.failure ?? 'network'),
    origin: endpoint(from, parsed?.snappedOrigin, parsed?.snapOriginM),
    destination: endpoint(to, parsed?.snappedDestination, parsed?.snapDestM),
    routeDistanceKm: ok ? parsed.distanceKm : null,
    routeDurationSec: ok ? parsed.durationSec : null,
    straightLineKm: round(straightKm, 3),
    ratio: ok && typeof straightKm === 'number' && straightKm > 0 ? round(parsed.distanceKm / straightKm, 2) : null,
  };
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
const GOOGLE_TRAVEL_MODES = { foot: 'walking', bike: 'bicycling' };

/**
 * Google Maps Directions URL (official api=1 format) for handing
 * navigation off to Google Maps — the user opens it explicitly; this
 * app does not navigate anyone anywhere by itself. Pure: returns the
 * URL, or null for missing/invalid coordinates or an unsupported
 * mode. NOTE the coordinate order: Google wants lat,lng — the
 * OPPOSITE of the FOSSGIS path segments in routeUrl above. Nothing
 * is fabricated: invalid input is a null, never a default place.
 */
export function googleMapsDirectionsUrl({ from, to, mode } = {}) {
  // Own-property check, not a bare lookup: GOOGLE_TRAVEL_MODES[mode]
  // would otherwise resolve inherited Object properties ('toString',
  // 'constructor', '__proto__') to truthy values for invalid modes.
  if (!Object.hasOwn(GOOGLE_TRAVEL_MODES, mode)) return null;
  const travelmode = GOOGLE_TRAVEL_MODES[mode];
  if (!validCoords(from) || !validCoords(to)) return null;
  return (
    'https://www.google.com/maps/dir/?api=1' +
    `&origin=${from.lat},${from.lng}` +
    `&destination=${to.lat},${to.lng}` +
    `&travelmode=${travelmode}`
  );
}

export function formatDuration(durationSec) {
  const mins = Math.round(durationSec / 60);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
