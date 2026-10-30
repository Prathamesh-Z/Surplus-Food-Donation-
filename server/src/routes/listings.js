import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.js';
import { formatDeadline } from '../lib/format.js';
import {
  createListingSchema,
  editListingSchema,
  cancelListingSchema,
} from '../validators/listings.js';
import { CHECKLIST_IDS, allChecklistConfirmed } from '../lib/checklist.js';
import {
  claimedPortions,
  clearedCodeFields,
  listingView,
  refreshListingStatus,
} from '../services/listingService.js';
import { createNotification, notifyAllClaimersAndNgos } from '../services/notificationService.js';
import { recognizeFood } from '../services/recognitionService.js';
import { UPLOADS_DIR } from '../lib/uploads.js';

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // same 5 MB cap as listing photos
});

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // PRD FR-04: max 5 MB
  fileFilter: (req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      const err = new Error('Photo must be JPEG, PNG or WebP');
      err.status = 422;
      return cb(err);
    }
    return cb(null, true);
  },
});

export const listingsRouter = Router();

// ── AI food recognition (PRD v3.3) ─────────────────────────────────────────
// Provider-only. The image is held in memory and forwarded to the local
// inference service; it is NOT stored by this route.
listingsRouter.post(
  '/recognize',
  requireAuth,
  requireRole('PROVIDER'),
  memoryUpload.single('photo'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        const err = new Error('No image uploaded.');
        err.status = 400;
        throw err;
      }
      const result = await recognizeFood(req.file.buffer, req.file.originalname);
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }
);

// ── Create (FR-04 + FR-05 gate) ────────────────────────────────────────────
listingsRouter.post('/', requireAuth, requireRole('PROVIDER'), async (req, res, next) => {
  try {
    const data = createListingSchema.parse(req.body);
    const confirmedItems = CHECKLIST_IDS.filter((id) => (data.checklistItems ?? []).includes(id));
    const isLive = allChecklistConfirmed(confirmedItems);
    const listing = await prisma.listing.create({
      data: {
        providerId: req.user.id,
        foodName: data.foodName,
        foodDetails: data.foodDetails,
        category: data.category,
        dietaryType: data.dietaryType,
        portionType: data.portionType,
        totalPortions: data.totalPortions,
        portionsRemaining: data.totalPortions,
        ngoSuitable: data.ngoSuitable ?? false,
        categoryNote: data.category === 'OTHER' ? (data.categoryNote ?? null) : null,
        bulkUnit: data.portionType === 'BULK_SERVINGS' ? (data.bulkUnit ?? null) : null,
        contactPhone: data.contactPhone ?? req.user.mobile,
        showContact: data.showContact ?? false,
        pickupLocationText: data.pickupLocationText,
        pickupLat: data.pickupLat ?? null,
        pickupLng: data.pickupLng ?? null,
        cookedAt: new Date(data.cookedAt),
        collectionDeadline: new Date(data.collectionDeadline),
        checklistConfirmedItems: confirmedItems,
        checklistConfirmedAt: isLive ? new Date() : null,
        status: isLive ? 'LIVE' : 'DRAFT',
        recurringScheduleId: data.recurringScheduleId ?? null,
      },
    });
    if (isLive) {
      await notifyAllClaimersAndNgos({
        type: 'NEW_LISTING',
        title: `New food available: ${listing.foodName}`,
        body: `${listing.totalPortions} portions — collect by ${formatDeadline(listing.collectionDeadline)}`,
        relatedListingId: listing.id,
      });
    }
    return res.status(201).json({ listing: listingView(listing, req.user.id) });
  } catch (err) {
    return next(err);
  }
});

// ── Publish a draft (FR-05) ────────────────────────────────────────────────
listingsRouter.post('/:id/publish', requireAuth, requireRole('PROVIDER'), async (req, res, next) => {
  try {
    const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
    if (!listing || listing.providerId !== req.user.id) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    if (listing.status !== 'DRAFT') {
      return res.status(409).json({ error: `Listing is ${listing.status}, not DRAFT` });
    }
    // A draft whose deadline already passed cannot be published into a
    // listing that the expiry job would kill within a minute — the provider
    // must move the deadline forward first (edit), then publish.
    if (new Date(listing.collectionDeadline) <= new Date()) {
      return res.status(409).json({ error: 'This listing has expired and cannot be published' });
    }
    const items = Array.isArray(req.body?.checklistItems)
      ? CHECKLIST_IDS.filter((id) => req.body.checklistItems.includes(id))
      : listing.checklistConfirmedItems;
    if (!allChecklistConfirmed(items)) {
      const missing = CHECKLIST_IDS.filter((id) => !items.includes(id));
      return res.status(422).json({
        error: 'Food-safety checklist incomplete — all 8 items must be confirmed to publish',
        missing,
      });
    }
    const updated = await prisma.listing.update({
      where: { id: listing.id },
      data: {
        checklistConfirmedItems: items,
        checklistConfirmedAt: new Date(),
        status: 'LIVE',
      },
    });
    await notifyAllClaimersAndNgos({
      type: 'NEW_LISTING',
      title: `New food available: ${updated.foodName}`,
      body: `${updated.totalPortions} portions — collect by ${formatDeadline(updated.collectionDeadline)}`,
      relatedListingId: updated.id,
    });
    return res.json({ listing: listingView(updated, req.user.id) });
  } catch (err) {
    return next(err);
  }
});

// ── Photo upload (FR-04/FR-10 of v2 numbering; FR-04 here) ─────────────────
listingsRouter.post(
  '/:id/photo',
  requireAuth,
  requireRole('PROVIDER'),
  upload.single('photo'),
  async (req, res, next) => {
    try {
      const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
      if (!listing || listing.providerId !== req.user.id) {
        return res.status(404).json({ error: 'Listing not found' });
      }
      if (!req.file) return res.status(422).json({ error: 'No photo file provided' });
      const photoPath = `/uploads/${req.file.filename}`;
      const updated = await prisma.listing.update({
        where: { id: listing.id },
        data: { photoPath },
      });
      return res.json({ listing: listingView(updated, req.user.id), photoPath });
    } catch (err) {
      return next(err);
    }
  }
);

// ── Provider's own listings (all statuses) ─────────────────────────────────
listingsRouter.get('/mine', requireAuth, requireRole('PROVIDER'), async (req, res) => {
  const listings = await prisma.listing.findMany({
    where: { providerId: req.user.id },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ listings: listings.map((l) => listingView(l, req.user.id)) });
});

// ── Browse / search / filters (FR-07, FR-08) ───────────────────────────────
// Ordering rule (PRD FR-07, final): collection deadline ascending,
// ties break by created-at descending. Pickup location is TEXT only —
// no coordinates, no distances, no nearest-first sorting anywhere.
listingsRouter.get('/', optionalAuth, async (req, res) => {
  const {
    q,
    category,
    dietaryType,
    portionType,
    ngoSuitable,
    endingSoon,
    availableOnly,
  } = req.query;
  const showAvailableOnly = availableOnly !== 'false';
  const statuses = showAvailableOnly
    ? ['LIVE', 'PARTIALLY_CLAIMED']
    : ['LIVE', 'PARTIALLY_CLAIMED', 'FULLY_CLAIMED'];
  const where = { status: { in: statuses } };
  if (category) where.category = { in: String(category).split(',').filter(Boolean) };
  if (dietaryType) where.dietaryType = String(dietaryType);
  if (portionType) where.portionType = String(portionType);
  if (ngoSuitable === 'true') where.ngoSuitable = true;
  if (endingSoon === 'true') {
    where.collectionDeadline = {
      gt: new Date(),
      lte: new Date(Date.now() + 60 * 60 * 1000),
    };
  }
  // BUG-01: normalize the search text's whitespace before the substring
  // match — trim, and collapse any run of spaces/tabs/newlines to one
  // space. Stored names are validated trimmed and single-spaced, so a
  // query typed with a trailing space, pasted with doubled spaces, or
  // padded by a voice transcript otherwise matches nothing at all. Only
  // the incoming query is normalized; stored names are never rewritten.
  const queryText = typeof q === 'string' ? q.trim().replace(/\s+/g, ' ') : '';
  if (queryText) {
    where.OR = [
      { foodName: { contains: queryText, mode: 'insensitive' } },
      { foodDetails: { contains: queryText, mode: 'insensitive' } },
    ];
  }
  const listings = await prisma.listing.findMany({
    where,
    include: { provider: { select: { name: true } } },
    orderBy: [{ collectionDeadline: 'asc' }, { createdAt: 'desc' }],
  });
  const now = Date.now();
  return res.json({
    listings: listings.map((l) => ({
      ...listingView(l, req.user?.id ?? null),
      timeRemainingMinutes: Math.max(
        0,
        Math.round((new Date(l.collectionDeadline).getTime() - now) / 60000)
      ),
    })),
  });
});

// ── Single listing ─────────────────────────────────────────────────────────
listingsRouter.get('/:id', optionalAuth, async (req, res) => {
  const listing = await prisma.listing.findUnique({
    where: { id: req.params.id },
    include: { provider: { select: { name: true } } },
  });
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  return res.json({ listing: listingView(listing, req.user?.id ?? null, { detail: true }) });
});

// ── Edit (FR-06) ───────────────────────────────────────────────────────────
listingsRouter.patch('/:id', requireAuth, requireRole('PROVIDER'), async (req, res, next) => {
  try {
    const data = editListingSchema.parse(req.body);
    const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
    if (!listing || listing.providerId !== req.user.id) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    if (['EXPIRED', 'CANCELLED', 'REMOVED_BY_ADMIN'].includes(listing.status)) {
      return res.status(409).json({ error: `Cannot edit a ${listing.status} listing` });
    }
    // QA-19: the 60s expiry job leaves a listing reading LIVE for up to a
    // minute past its deadline. Close that window at edit time with the same
    // deadline check the claim path uses. DRAFTs are exempt on purpose: a
    // stale draft's natural fix is editing its deadline forward.
    if (
      ['LIVE', 'PARTIALLY_CLAIMED', 'FULLY_CLAIMED'].includes(listing.status) &&
      new Date(listing.collectionDeadline) <= new Date()
    ) {
      return res.status(409).json({ error: 'This listing has expired' });
    }
    if (data.collectionDeadline && new Date(data.collectionDeadline) <= new Date()) {
      return res.status(422).json({ error: 'collectionDeadline cannot be in the past' });
    }
    const update = { ...data };
    delete update.checklistItems;
    if (data.checklistItems) {
      update.checklistConfirmedItems = CHECKLIST_IDS.filter((id) =>
        data.checklistItems.includes(id)
      );
    }
    if (data.cookedAt) update.cookedAt = new Date(data.cookedAt);
    if (data.collectionDeadline) update.collectionDeadline = new Date(data.collectionDeadline);
    if (data.totalPortions !== undefined) {
      const claimed = await claimedPortions(listing.id);
      if (data.totalPortions < claimed) {
        return res.status(409).json({
          error: `Total portions (${data.totalPortions}) cannot be below already-claimed portions (${claimed})`,
        });
      }
      update.portionsRemaining = data.totalPortions - claimed;
    }
    const updated = await prisma.listing.update({ where: { id: listing.id }, data: update });
    const refreshed = await refreshListingStatus(updated.id);
    return res.json({ listing: listingView(refreshed ?? updated, req.user.id) });
  } catch (err) {
    return next(err);
  }
});

// ── Cancel listing (FR-06) ─────────────────────────────────────────────────
listingsRouter.post('/:id/cancel', requireAuth, requireRole('PROVIDER'), async (req, res, next) => {
  try {
    const { reason } = cancelListingSchema.parse(req.body);
    const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
    if (!listing || listing.providerId !== req.user.id) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    if (['CANCELLED', 'EXPIRED', 'REMOVED_BY_ADMIN'].includes(listing.status)) {
      return res.status(409).json({ error: `Listing is already ${listing.status}` });
    }
    const openClaims = await prisma.claim.findMany({
      where: { listingId: listing.id, status: 'CONFIRMED' },
    });
    const updated = await prisma.$transaction(async (tx) => {
      for (const claim of openClaims) {
        await tx.claim.update({
          where: { id: claim.id },
          data: { status: 'CANCELLED_BY_PROVIDER', ...clearedCodeFields() },
        });
        await createNotification(
          {
            userId: claim.claimerId,
            type: 'LISTING_CANCELLED',
            title: 'A listing you claimed was cancelled',
            body: `"${listing.foodName}" was cancelled by the provider: ${reason}`,
            relatedListingId: listing.id,
            relatedClaimId: claim.id,
          },
          tx
        );
      }
      return tx.listing.update({
        where: { id: listing.id },
        data: { status: 'CANCELLED', cancelReason: reason },
      });
    });
    return res.json({ listing: listingView(updated, req.user.id), cancelledClaims: openClaims.length });
  } catch (err) {
    return next(err);
  }
});
