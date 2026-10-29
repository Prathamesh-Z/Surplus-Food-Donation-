/**
 * Expiry priority (v3.6) — ONE central definition used by every listing
 * card, so thresholds never scatter across components.
 *
 * Based on the listing's actual collection deadline:
 *   high    — 6 hours or less remaining   (needs immediate attention)
 *   medium  — more than 6, up to 24 hours
 *   low     — more than 24 hours
 *   expired — deadline has passed
 *   unknown — deadline missing/invalid (NEVER shown as low priority)
 *
 * Note: listings in this app are created with deadlines within 24 hours
 * (PRD FR-04), so "low" is rare in practice — it exists for correctness,
 * not decoration.
 */
export const PRIORITY_THRESHOLDS = { highMaxMinutes: 6 * 60, mediumMaxMinutes: 24 * 60 };

export function expiryPriority(deadline, now = new Date()) {
  if (!deadline) return { level: 'unknown', minutes: null };
  const end = new Date(deadline).getTime();
  if (Number.isNaN(end)) return { level: 'unknown', minutes: null };
  const minutes = Math.round((end - now.getTime()) / 60000);
  if (minutes < 0) return { level: 'expired', minutes };
  if (minutes <= PRIORITY_THRESHOLDS.highMaxMinutes) return { level: 'high', minutes };
  if (minutes <= PRIORITY_THRESHOLDS.mediumMaxMinutes) return { level: 'medium', minutes };
  return { level: 'low', minutes };
}

export const PRIORITY_COLORS = {
  high: '#b3261e',
  medium: '#b58900',
  low: '#1e7d32',
  expired: '#5f6368',
  unknown: '#5f6368',
};

export const PRIORITY_LABEL_KEYS = {
  high: 'priorityHigh',
  medium: 'priorityMedium',
  low: 'priorityLow',
  expired: 'priorityExpired',
  unknown: 'priorityUnknown',
};
