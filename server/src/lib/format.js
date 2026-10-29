// Shared human-readable formatting for user-facing text (QA-07: notification
// bodies used to embed raw ISO timestamps like 2026-10-29T18:45:00.000Z).
// Server-rendered bodies use IST, matching the app's India-first audience;
// the client renders its own dates with toLocaleString.
export function formatDeadline(date) {
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
