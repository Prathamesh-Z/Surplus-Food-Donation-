import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { scheduleSchema } from '../validators/p1.js';
import { generateDueOccurrences } from '../services/recurringService.js';

export const recurringRouter = Router();
recurringRouter.use(requireAuth, requireRole('PROVIDER'));

recurringRouter.post('/', async (req, res, next) => {
  try {
    const data = scheduleSchema.parse(req.body);
    const schedule = await prisma.recurringSchedule.create({
      data: {
        providerId: req.user.id,
        templateFields: { title: data.title, ...data.template },
        daysOfWeek: data.daysOfWeek,
        generationTimeLocal: data.generationTimeLocal,
        deadlineOffsetMinutes: data.deadlineOffsetMinutes ?? 180,
      },
    });
    return res.status(201).json({ schedule });
  } catch (err) {
    return next(err);
  }
});

recurringRouter.get('/', async (req, res) => {
  const schedules = await prisma.recurringSchedule.findMany({
    where: { providerId: req.user.id },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ schedules });
});

recurringRouter.patch('/:id', async (req, res, next) => {
  try {
    const schedule = await prisma.recurringSchedule.findUnique({ where: { id: req.params.id } });
    if (!schedule || schedule.providerId !== req.user.id) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    const update = {};
    if (typeof req.body?.active === 'boolean') update.active = req.body.active;
    if (Array.isArray(req.body?.daysOfWeek)) update.daysOfWeek = req.body.daysOfWeek;
    if (typeof req.body?.generationTimeLocal === 'string') {
      update.generationTimeLocal = req.body.generationTimeLocal;
    }
    if (Number.isInteger(req.body?.deadlineOffsetMinutes)) {
      update.deadlineOffsetMinutes = req.body.deadlineOffsetMinutes;
    }
    const updated = await prisma.recurringSchedule.update({ where: { id: schedule.id }, data: update });
    return res.json({ schedule: updated });
  } catch (err) {
    return next(err);
  }
});

recurringRouter.delete('/:id', async (req, res) => {
  const schedule = await prisma.recurringSchedule.findUnique({ where: { id: req.params.id } });
  if (!schedule || schedule.providerId !== req.user.id) {
    return res.status(404).json({ error: 'Schedule not found' });
  }
  await prisma.recurringSchedule.delete({ where: { id: schedule.id } });
  return res.json({ ok: true });
});

// Runs the same due-occurrence generation the scheduler performs — the
// demo uses it to show an occurrence appearing without waiting for the
// clock; it still only ever creates a DRAFT.
recurringRouter.post('/generate-now', async (req, res) => {
  const created = await generateDueOccurrences();
  return res.json({ created });
});
