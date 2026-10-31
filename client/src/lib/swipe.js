// Pure swipe-decision logic for notification cards (PRD v3.26).
// Kept free of DOM/React so the established node-check pattern can
// verify the dismissal rules — the 80 px threshold and the
// vertical-scroll protection — without a client test framework.

/** Horizontal distance (px) a drag must reach to dismiss on release. */
export const SWIPE_THRESHOLD_PX = 80;

/** Movement (px) before a drag is assigned to an axis at all. */
export const SWIPE_INTENT_PX = 10;

/**
 * Which axis a pointer drag belongs to once it exceeds the intent
 * distance. Vertical wins every tie, so a mostly-vertical drag is
 * always treated as scrolling and can never dismiss. Returns null
 * while the drag is still undecided.
 */
export function swipeAxis(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax <= SWIPE_INTENT_PX && ay <= SWIPE_INTENT_PX) return null;
  if (ay >= ax) return 'vertical';
  return 'horizontal';
}

/**
 * Verdict when the pointer is released: 'dismiss' only for a
 * horizontal drag that reached the threshold; 'snap' (return to
 * place, no action) for everything else.
 */
export function swipeReleaseVerdict(dx, dy) {
  if (swipeAxis(dx, dy) !== 'horizontal') return 'snap';
  return Math.abs(dx) >= SWIPE_THRESHOLD_PX ? 'dismiss' : 'snap';
}
