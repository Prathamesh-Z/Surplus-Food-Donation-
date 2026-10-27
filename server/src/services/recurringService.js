import { prisma } from '../lib/prisma.js';
import { createNotification } from './notificationService.js';

// PRD FR-18 — recurring donations. A due schedule generates a DRAFT
// occurrence for the provider to complete that day (portions + fresh
// food-safety checklist). An occurrence is NEVER auto-published.
export function kolkataNow(now = new Date()) {
  // Shift the instant so local getters read Asia/Kolkata wall time.
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const pad = (n) => String(n).padStart(2, '0');
  return {
    weekday: ist.getDay(), // 0 = Sunday … 6 = Saturday
    hhmm: `${pad(ist.getHours())}:${pad(ist.getMinutes())}`,
    dateStr: `${ist.getFullYear()}-${pad(ist.getMonth() + 1)}-${pad(ist.getDate())}`,
  };
}

export async function generateDueOccurrences(client = prisma, now = new Date()) {
  const { weekday, hhmm, dateStr } = kolkataNow(now);
  const schedules = await client.recurringSchedule.findMany({
    where: { active: true },
  });
  let created = 0;
  for (const s of schedules) {
    if (!s.daysOfWeek.includes(weekday)) continue;
    if (hhmm < s.generationTimeLocal) continue;
    if (s.lastGeneratedOn === dateStr) continue;
    const tpl = s.templateFields ?? {};
    await client.$transaction(async (tx) => {
      const draft = await tx.listing.create({
        data: {
          providerId: s.providerId,
          foodName: tpl.foodName ?? tpl.title ?? 'Recurring donation',
          foodDetails: tpl.foodDetails ?? '',
          category: tpl.category ?? 'COOKED_MEALS',
          dietaryType: tpl.dietaryType ?? 'VEG',
          portionType: tpl.portionType ?? 'INDIVIDUAL_MEALS',
          // Portions are set by the provider when completing the draft —
          // a schedule never guesses a quantity.
          totalPortions: 0,
          portionsRemaining: 0,
          ngoSuitable: tpl.ngoSuitable ?? false,
          pickupLocationText: tpl.pickupLocationText ?? '',
          cookedAt: now,
          collectionDeadline: new Date(now.getTime() + s.deadlineOffsetMinutes * 60000),
          checklistConfirmedItems: [],
          status: 'DRAFT',
          recurringScheduleId: s.id,
        },
      });
      await tx.recurringSchedule.update({
        where: { id: s.id },
        data: { lastGeneratedOn: dateStr },
      });
      await createNotification(
        {
          userId: s.providerId,
          type: 'RECURRING_OCCURRENCE',
          title: 'Recurring donation draft ready',
          body: `Today's occurrence of "${tpl.title ?? tpl.foodName}" was created as a DRAFT. Set today's portions and confirm the safety checklist to publish it.`,
          relatedListingId: draft.id,
        },
        tx
      );
    });
    created += 1;
  }
  return created;
}
