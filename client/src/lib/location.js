/**
 * Saved-location helpers (PRD v3.20, batch F8).
 *
 * The saved location record (localStorage `fws_location`) is
 * { label, lat, lng, savedAt, source? } — `source` ('gps' | 'pin' |
 * 'text') was added in v3.20; older records have no source and are
 * interpreted, never migrated. These helpers are pure so the rules
 * (accuracy bands, source display, change detection) are testable
 * without a browser.
 */
import { validCoords } from './distance.js';

/** True when the record carries usable coordinates. */
export function hasUsableCoords(loc) {
  return validCoords(loc);
}

/**
 * GPS accuracy bands (metres, as reported by the device — never
 * fabricated here): <=100 good, 100–500 warn, >500 poor (needs an
 * explicit acknowledgement before saving). A missing/non-numeric
 * reading is 'unknown' — the fix is usable, its precision is not
 * claimed.
 */
export function accuracyBand(accuracyM) {
  if (typeof accuracyM !== 'number' || Number.isNaN(accuracyM) || accuracyM < 0) return 'unknown';
  if (accuracyM <= 100) return 'good';
  if (accuracyM <= 500) return 'warn';
  return 'poor';
}

/**
 * The i18n key naming a record's source. Legacy records without a
 * stored source are derived honestly: no coordinates means the user
 * typed a place name; coordinates without a known source are just
 * "saved" (we do not guess GPS vs pin for old records).
 */
export function locationSourceKey(loc) {
  if (!loc) return null;
  if (loc.source === 'gps') return 'sourceGps';
  if (loc.source === 'pin') return 'sourcePin';
  if (loc.source === 'text') return 'sourceText';
  if (!hasUsableCoords(loc)) return 'sourceText';
  return 'sourceSaved';
}

/** True when two location records describe the same saved place. */
export function sameLocation(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.label === b.label && a.lat === b.lat && a.lng === b.lng;
}
