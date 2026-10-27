import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createClaimSchema, verifyClaimSchema } from '../validators/claims.js';
import {
  generateCode,
  codeStorageFields,
  codeHmac,
  verifySaltedHash,
  decryptCode,
} from '../services/pickupCodeService.js';
import { clearedCodeFields, refreshListingStatus } from '../services/listingService.js';
import { createNotification } from '../services/notificationService.js';

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// ── Create a claim (FR-09) ──────────────────────────────────────────────────
// Runs inside a single transaction with a row lock on the listing, so
// parallel claims can never oversell portionsRemaining.
async function createClaim({ listingId, portions, claimer }) {
  const listingPeek = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listingPeek) throw httpError(404, 'Listing not found');
  if (listingPeek.providerId === claimer.id) {
    throw httpError(403, 'You cannot claim your own listing');
  }

  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const fields = codeStorageFields(code);
    try {
      const claim = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw`
          SELECT "id", "status", "portionsRemaining", "collectionDeadline", "providerId", "foodName"
          FROM "Listing" WHERE "id" = ${listingId} FOR UPDATE`;
        const listing = rows[0];
        if (!listing) throw httpError(404, 'Listing not found');
        if (listing.status === 'EXPIRED' || new Date(listing.collectionDeadline) <= new Date()) {
          throw httpError(409, 'This listing has expired');
        }
        if (!['LIVE', 'PARTIALLY_CLAIMED'].includes(listing.status)) {
          throw httpError(409, `Listing is not available for claims (status ${listing.status})`);
        }
        if (portions > listing.portionsRemaining) {
          throw httpError(
            409,
            `Only ${listing.portionsRemaining} portions remain on this listing`
          );
        }
        const remaining = listing.portionsRemaining - portions;
        await tx.listing.update({
          where: { id: listingId },
          data: {
            portionsRemaining: remaining,
            status: remaining === 0 ? 'FULLY_CLAIMED' : 'PARTIALLY_CLAIMED',
          },
        });
        const created = await tx.claim.create({
          data: {
            listingId,
            claimerId: claimer.id,
            portionsClaimed: portions,
            status: 'CONFIRMED',
            ...fields,
          },
        });
        await createNotification(
          {
            userId: listing.providerId,
            type: 'CLAIM_PLACED',
            title: 'New claim on your listing',
            body: `${claimer.name} claimed ${portions} portions of "${listing.foodName}".`,
            relatedListingId: listingId,
            relatedClaimId: created.id,
          },
          tx
        );
        return created;
      });
      return { claim, code };
    } catch (err) {
      // Unique violation on pickupCodeHmac — regenerate and retry (FR-11).
      if (err && err.code === 'P2002') {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? httpError(500, 'Could not allocate a unique pickup code');
}

export const claimsRouter = Router();

claimsRouter.post('/', requireAuth, requireRole('CLAIMER', 'NGO'), async (req, res, next) => {
  try {
    const data = createClaimSchema.parse(req.body);
    const { claim, code } = await createClaim({
      listingId: data.listingId,
      portions: data.portions,
      claimer: req.user,
    });
    return res.status(201).json({
      claim: {
        id: claim.id,
        listingId: claim.listingId,
        portionsClaimed: claim.portionsClaimed,
        status: claim.status,
        createdAt: claim.createdAt,
      },
      pickupCode: code,
    });
  } catch (err) {
    return next(err);
  }
});

claimsRouter.get('/mine', requireAuth, requireRole('CLAIMER', 'NGO'), async (req, res) => {
  const claims = await prisma.claim.findMany({
    where: { claimerId: req.user.id },
    include: {
      listing: {
        select: {
          id: true,
          foodName: true,
          pickupLocationText: true,
          collectionDeadline: true,
          status: true,
          provider: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({
    claims: claims.map((c) => ({
      id: c.id,
      listingId: c.listingId,
      portionsClaimed: c.portionsClaimed,
      status: c.status,
      collectedAt: c.collectedAt,
      createdAt: c.createdAt,
      listing: {
        foodName: c.listing.foodName,
        pickupLocationText: c.listing.pickupLocationText,
        collectionDeadline: c.listing.collectionDeadline,
        providerName: c.listing.provider.name,
      },
    })),
  });
});

claimsRouter.get('/:id', requireAuth, async (req, res) => {
  const claim = await prisma.claim.findUnique({
    where: { id: req.params.id },
    include: { listing: true },
  });
  if (!claim) return res.status(404).json({ error: 'Claim not found' });
  const allowed =
    claim.claimerId === req.user.id ||
    claim.listing.providerId === req.user.id ||
    req.user.role === 'ADMIN';
  if (!allowed) return res.status(403).json({ error: 'Not your claim' });
  return res.json({
    claim: {
      id: claim.id,
      listingId: claim.listingId,
      claimerId: claim.claimerId,
      portionsClaimed: claim.portionsClaimed,
      status: claim.status,
      collectedAt: claim.collectedAt,
      createdAt: claim.createdAt,
    },
  });
});

// Owner re-view of the pickup code (FR-11): only the claim's owner, only
// while the claim is active. The code is never in any list/log/admin view.
claimsRouter.get('/:id/code', requireAuth, async (req, res) => {
  const claim = await prisma.claim.findUnique({ where: { id: req.params.id } });
  if (!claim) return res.status(404).json({ error: 'Claim not found' });
  if (claim.claimerId !== req.user.id) return res.status(403).json({ error: 'Not your claim' });
  if (claim.status !== 'CONFIRMED') {
    return res.status(409).json({ error: `No active pickup code — claim is ${claim.status}` });
  }
  const code = decryptCode(claim);
  if (!code) return res.status(409).json({ error: 'Pickup code no longer available' });
  return res.json({ pickupCode: code });
});

// ── Cancel a claim (FR-10) ──────────────────────────────────────────────────
claimsRouter.post('/:id/cancel', requireAuth, requireRole('CLAIMER', 'NGO'), async (req, res, next) => {
  try {
    const claim = await prisma.claim.findUnique({
      where: { id: req.params.id },
      include: { listing: true },
    });
    if (!claim || claim.claimerId !== req.user.id) {
      return res.status(404).json({ error: 'Claim not found' });
    }
    if (claim.status !== 'CONFIRMED') {
      return res.status(409).json({ error: `Claim is ${claim.status} and cannot be cancelled` });
    }
    const minutesLeft =
      (new Date(claim.listing.collectionDeadline).getTime() - Date.now()) / 60000;
    const onTime = minutesLeft >= 30;
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw`
        SELECT "id" FROM "Listing" WHERE "id" = ${claim.listingId} FOR UPDATE`;
      if (rows.length === 0) throw httpError(404, 'Listing not found');
      const updated = await tx.claim.update({
        where: { id: claim.id },
        data: {
          status: onTime ? 'CANCELLED_ON_TIME' : 'CANCELLED_LATE',
          ...clearedCodeFields(),
        },
      });
      if (onTime) {
        const listing = await tx.listing.findUnique({ where: { id: claim.listingId } });
        await tx.listing.update({
          where: { id: claim.listingId },
          data: { portionsRemaining: listing.portionsRemaining + claim.portionsClaimed },
        });
      }
      await createNotification(
        {
          userId: claim.listing.providerId,
          type: 'CLAIM_CANCELLED',
          title: 'A claim on your listing was cancelled',
          body: onTime
            ? `A claim for ${claim.portionsClaimed} portions of "${claim.listing.foodName}" was cancelled; the portions are available again.`
            : `A claim for ${claim.portionsClaimed} portions of "${claim.listing.foodName}" was cancelled less than 30 minutes before the deadline; the portions were not returned.`,
          relatedListingId: claim.listingId,
          relatedClaimId: claim.id,
        },
        tx
      );
      return updated;
    });
    await refreshListingStatus(claim.listingId);
    return res.json({
      claim: { id: result.id, status: result.status },
      portionsReturned: onTime ? claim.portionsClaimed : 0,
    });
  } catch (err) {
    return next(err);
  }
});

// ── Verify pickup & mark collected (FR-12) ──────────────────────────────────
// The actor is the PROVIDER who owns the listing, entering the code the
// claimer shows. Idempotent: verifying an already-collected claim returns
// the original collected-at with no state change.
claimsRouter.post('/:id/verify', requireAuth, requireRole('PROVIDER'), async (req, res, next) => {
  try {
    const { code } = verifyClaimSchema.parse(req.body);
    const claim = await prisma.claim.findUnique({
      where: { id: req.params.id },
      include: { listing: true, claimer: { select: { name: true } } },
    });
    if (!claim || claim.listing.providerId !== req.user.id) {
      return res.status(404).json({ error: 'Claim not found for your listings' });
    }
    if (claim.status === 'COLLECTED') {
      return res.json({
        status: 'COLLECTED',
        alreadyCollected: true,
        collectedAt: claim.collectedAt,
        message: 'This claim was already collected.',
      });
    }
    if (claim.status !== 'CONFIRMED') {
      return res.status(409).json({
        error:
          claim.status === 'EXPIRED'
            ? 'This claim has expired and can no longer be collected'
            : `Claim is ${claim.status} and cannot be collected`,
      });
    }
    if (claim.verifyLockedUntil && claim.verifyLockedUntil > new Date()) {
      return res.status(423).json({
        error: 'Verification locked after too many wrong attempts. Try again in a few minutes.',
        lockedUntil: claim.verifyLockedUntil,
      });
    }
    if (!verifySaltedHash(code, claim.pickupCodeSalt, claim.pickupCodeHash)) {
      const fails = claim.verifyFailCount + 1;
      const locked = fails >= 5;
      await prisma.claim.update({
        where: { id: claim.id },
        data: {
          verifyFailCount: fails,
          verifyLockedUntil: locked ? new Date(Date.now() + 10 * 60 * 1000) : claim.verifyLockedUntil,
        },
      });
      return res.status(401).json({
        error: locked
          ? 'Incorrect pickup code. Verification is now locked for 10 minutes.'
          : 'Incorrect pickup code',
        attemptsRemaining: Math.max(0, 5 - fails),
      });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const done = await tx.claim.update({
        where: { id: claim.id },
        data: {
          status: 'COLLECTED',
          collectedAt: new Date(),
          verifyFailCount: 0,
          verifyLockedUntil: null,
          ...clearedCodeFields(),
        },
      });
      await createNotification(
        {
          userId: claim.claimerId,
          type: 'CLAIM_COLLECTED',
          title: 'Collection confirmed',
          body: `Your ${claim.portionsClaimed} portions of "${claim.listing.foodName}" were marked collected.`,
          relatedListingId: claim.listingId,
          relatedClaimId: claim.id,
        },
        tx
      );
      return done;
    });
    await refreshListingStatus(claim.listingId);
    return res.json({
      status: 'COLLECTED',
      alreadyCollected: false,
      collectedAt: updated.collectedAt,
    });
  } catch (err) {
    return next(err);
  }
});

// Claims on one listing, visible to that listing's provider (FR-12 UI).
export const listingClaimsRouter = Router();
listingClaimsRouter.get(
  '/:id/claims',
  requireAuth,
  requireRole('PROVIDER'),
  async (req, res) => {
    const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
    if (!listing || listing.providerId !== req.user.id) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    const claims = await prisma.claim.findMany({
      where: { listingId: listing.id },
      include: { claimer: { select: { name: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return res.json({
      claims: claims.map((c) => ({
        id: c.id,
        claimerName: c.claimer.name,
        claimerRole: c.claimer.role,
        portionsClaimed: c.portionsClaimed,
        status: c.status,
        collectedAt: c.collectedAt,
        createdAt: c.createdAt,
      })),
    });
  }
);
