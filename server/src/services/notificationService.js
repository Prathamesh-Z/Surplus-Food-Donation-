import { prisma } from '../lib/prisma.js';
import { sendEmail } from './emailService.js';

// Notification rows are the primary notification channel (PRD FR-14:
// in-app, UI polls every 15 seconds). When SMTP is configured, email
// mirrors the same events as a second channel (FR-24) — best-effort,
// fire-and-forget, and only outside database transactions.
export async function createNotification({ userId, type, title, body, relatedListingId, relatedClaimId }, client = prisma) {
  const note = await client.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      relatedListingId: relatedListingId ?? null,
      relatedClaimId: relatedClaimId ?? null,
    },
  });
  if (client === prisma) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user?.email) {
      void sendEmail({ to: user.email, subject: title, text: body });
    }
  }
  return note;
}

export async function notifyAllClaimersAndNgos(payload, client = prisma) {
  const users = await client.user.findMany({
    where: { role: { in: ['CLAIMER', 'NGO'] }, suspended: false },
    select: { id: true, email: true },
  });
  if (users.length === 0) return 0;
  await client.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      relatedListingId: payload.relatedListingId ?? null,
      relatedClaimId: payload.relatedClaimId ?? null,
    })),
  });
  for (const u of users) {
    void sendEmail({ to: u.email, subject: payload.title, text: payload.body });
  }
  return users.length;
}
