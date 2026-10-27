import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { platformImpact, userImpact } from '../services/impactService.js';

// PRD FR-15 — impact dashboard: platform totals plus the signed-in user's
// own contribution, per role. FR-22 history is served by /listings/mine and
// /claims/mine, which include cancelled and expired records.
export const dashboardRouter = Router();

dashboardRouter.get('/', requireAuth, async (req, res) => {
  const [platform, mine] = await Promise.all([platformImpact(), userImpact(req.user)]);
  return res.json({ platform, mine, role: req.user.role });
});

// PRD FR-23 (P2) — the same figures as the dashboard, as a CSV download.
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

dashboardRouter.get('/export.csv', requireAuth, async (req, res) => {
  const [platform, mine] = await Promise.all([platformImpact(), userImpact(req.user)]);
  const lines = ['section,metric,value'];
  for (const [k, v] of Object.entries(platform)) lines.push(`platform,${csvEscape(k)},${csvEscape(v)}`);
  for (const [k, v] of Object.entries(mine)) lines.push(`mine_${req.user.role.toLowerCase()},${csvEscape(k)},${csvEscape(v)}`);
  if (req.user.role === 'PROVIDER') {
    const listings = await prisma.listing.findMany({
      where: { providerId: req.user.id },
      orderBy: { createdAt: 'asc' },
    });
    lines.push('listing_id,food_name,total_portions,portions_remaining,status,deadline');
    for (const l of listings) {
      lines.push(
        [l.id, l.foodName, l.totalPortions, l.portionsRemaining, l.status, l.collectionDeadline.toISOString()]
          .map(csvEscape)
          .join(',')
      );
    }
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="food-waste-saver-impact.csv"');
  return res.send(lines.join('\n'));
});
