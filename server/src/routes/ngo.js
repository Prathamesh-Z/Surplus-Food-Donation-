import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  redistributionSchema,
  redistributionEditSchema,
} from '../validators/p1.js';

// PRD FR-17 — NGO redistribution log. Entries are credited to this NGO
// (never to the provider), and the logged total for a claim can never
// exceed the portions that NGO actually collected on it.
export const ngoRouter = Router();
ngoRouter.use(requireAuth, requireRole('NGO'));

ngoRouter.get('/me', async (req, res) => {
  const profile = await prisma.ngoProfile.findUnique({ where: { userId: req.user.id } });
  return res.json({
    profile,
    verificationStatus: profile?.verificationStatus ?? 'UNVERIFIED',
    verified: profile?.verificationStatus === 'VERIFIED',
  });
});

async function loggedSum(claimId, client = prisma, excludeId = undefined) {
  const agg = await client.redistributionLog.aggregate({
    where: { claimId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    _sum: { portions: true },
  });
  return agg._sum.portions ?? 0;
}

// Editable until end of day after collection (FR-17).
export function editDeadlineFor(collectedAt) {
  const d = new Date(collectedAt);
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 59, 999);
  return d;
}

ngoRouter.post('/redistributions', async (req, res, next) => {
  try {
    const data = redistributionSchema.parse(req.body);
    const claim = await prisma.claim.findUnique({
      where: { id: data.claimId },
      include: { listing: { select: { foodName: true } } },
    });
    if (!claim || claim.claimerId !== req.user.id) {
      return res.status(404).json({ error: 'Claim not found among your claims' });
    }
    if (claim.status !== 'COLLECTED') {
      return res.status(409).json({ error: 'Redistribution can only be logged for a COLLECTED claim' });
    }
    const already = await loggedSum(claim.id);
    if (already + data.portions > claim.portionsClaimed) {
      return res.status(409).json({
        error: `Logged portions (${already + data.portions}) would exceed the collected portions (${claim.portionsClaimed})`,
      });
    }
    const entry = await prisma.redistributionLog.create({
      data: {
        claimId: claim.id,
        ngoId: req.user.id,
        destinationName: data.destinationName,
        destinationType: data.destinationType,
        portions: data.portions,
        redistributedAt: data.redistributedAt ? new Date(data.redistributedAt) : new Date(),
        notes: data.notes ?? null,
      },
    });
    return res.status(201).json({ entry });
  } catch (err) {
    return next(err);
  }
});

ngoRouter.get('/redistributions', async (req, res) => {
  const entries = await prisma.redistributionLog.findMany({
    where: { ngoId: req.user.id },
    include: {
      claim: {
        select: {
          portionsClaimed: true,
          collectedAt: true,
          listing: { select: { foodName: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ entries });
});

ngoRouter.patch('/redistributions/:id', async (req, res, next) => {
  try {
    const data = redistributionEditSchema.parse(req.body);
    const entry = await prisma.redistributionLog.findUnique({
      where: { id: req.params.id },
      include: { claim: true },
    });
    if (!entry || entry.ngoId !== req.user.id) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    if (new Date() > editDeadlineFor(entry.claim.collectedAt)) {
      return res.status(409).json({ error: 'This entry is locked — edits close at the end of the day after collection' });
    }
    if (data.portions !== undefined) {
      const others = await loggedSum(entry.claimId, prisma, entry.id);
      if (others + data.portions > entry.claim.portionsClaimed) {
        return res.status(409).json({ error: 'Logged portions would exceed the collected portions' });
      }
    }
    const updated = await prisma.redistributionLog.update({
      where: { id: entry.id },
      data,
    });
    return res.json({ entry: updated });
  } catch (err) {
    return next(err);
  }
});

ngoRouter.delete('/redistributions/:id', async (req, res) => {
  const entry = await prisma.redistributionLog.findUnique({
    where: { id: req.params.id },
    include: { claim: true },
  });
  if (!entry || entry.ngoId !== req.user.id) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  if (new Date() > editDeadlineFor(entry.claim.collectedAt)) {
    return res.status(409).json({ error: 'This entry is locked' });
  }
  await prisma.redistributionLog.delete({ where: { id: entry.id } });
  return res.json({ ok: true });
});
