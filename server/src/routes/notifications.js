import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

// PRD FR-14 — in-app notifications only; the client polls this endpoint
// every 15 seconds. No push, no real-time transport anywhere in the build.
export const notificationsRouter = Router();

notificationsRouter.get('/', requireAuth, async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const unreadCount = await prisma.notification.count({
    where: { userId: req.user.id, read: false },
  });
  return res.json({ notifications, unreadCount });
});

notificationsRouter.post('/:id/read', requireAuth, async (req, res) => {
  const note = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!note || note.userId !== req.user.id) {
    return res.status(404).json({ error: 'Notification not found' });
  }
  const updated = await prisma.notification.update({
    where: { id: note.id },
    data: { read: true },
  });
  return res.json({ notification: updated });
});

notificationsRouter.post('/read-all', requireAuth, async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user.id, read: false },
    data: { read: true },
  });
  return res.json({ updated: result.count });
});

notificationsRouter.delete('/:id', requireAuth, async (req, res) => {
  const note = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!note || note.userId !== req.user.id) {
    return res.status(404).json({ error: 'Notification not found' });
  }
  await prisma.notification.delete({ where: { id: note.id } });
  return res.json({ dismissed: true });
});
