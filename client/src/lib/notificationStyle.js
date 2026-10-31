// Pure presentation helpers for notification cards (v3.26.1):
// the per-type accent colour and the seconds-free timestamp.
// Kept DOM-free so the node-check pattern can verify them.

/**
 * Restrained accent colour per notification type (NotificationType
 * enum). Related types share an accent so the list scans by meaning:
 * green = new food, blue = claim activity, teal = collected,
 * amber = deadline pressure, brick = cancellations, grey = expired.
 * Unknown or future types fall back to the app's neutral border tone.
 */
export const NOTIFICATION_ACCENTS = {
  NEW_LISTING: '#2e8b57',
  CLAIM_PLACED: '#3366a3',
  CLAIMER_ON_THE_WAY: '#7a5fa3',
  CLAIM_COLLECTED: '#2f7f7a',
  CLAIM_CANCELLED: '#a34d3a',
  LISTING_CANCELLED: '#a34d3a',
  NEAR_DEADLINE_PROVIDER: '#b07d2b',
  NEAR_DEADLINE_CLAIMERS: '#b07d2b',
  CLAIM_EXPIRED: '#6e6e6e',
  RECURRING_OCCURRENCE: '#5b7a99',
  ADMIN_ALERT: '#a33a5f',
};

export const NOTIFICATION_ACCENT_DEFAULT = '#c9d6c3';

export function notificationAccent(type) {
  return Object.hasOwn(NOTIFICATION_ACCENTS, type)
    ? NOTIFICATION_ACCENTS[type]
    : NOTIFICATION_ACCENT_DEFAULT;
}

/**
 * Locale date + time without seconds (e.g. "31/10/2026, 10:42 am"):
 * the date keeps the platform's default locale formatting; only the
 * seconds are dropped from the time.
 */
export function formatNotificationTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString()}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}
