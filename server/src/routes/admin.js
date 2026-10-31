import { Router } from 'express';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import { prisma } from '../lib/prisma.js';
import { NGO_DOCS_DIR, UPLOADS_DIR, AVATARS_DIR } from '../lib/uploads.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { platformImpact } from '../services/impactService.js';
import { writeAudit } from '../services/auditService.js';
import { clearedCodeFields } from '../services/listingService.js';
import { createNotification } from '../services/notificationService.js';

const reasonSchema = z.object({ reason: z.string().trim().min(3) });
const optionalReasonSchema = z.object({ reason: z.string().trim().min(3).optional() });

// User management (v3.33): an account counts as an admin when EITHER
// field says so — requireRole enforces on `role`, while account
// management keys off `accountType`. Checking both keeps legacy rows
// (role ADMIN whose accountType was never backfilled) protected by the
// same invariants until a demote/promote rewrites both fields together.
const adminWhere = { OR: [{ accountType: 'ADMIN' }, { role: 'ADMIN' }] };
const isAdminAccount = (u) => u.accountType === 'ADMIN' || u.role === 'ADMIN';
class LastAdminError extends Error {}

// PRD FR-20 / FR-21 / FR-16 — everything under /admin is ADMIN-only,
// enforced by requireRole on every route (a direct API call by a
// non-admin returns 403). The admin never sees pickup codes (FR-21).
export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));

adminRouter.get('/stats', async (req, res) => {
  const [platform, totalUsers, pendingNgo, suspendedUsers] = await Promise.all([
    platformImpact(),
    prisma.user.count(),
    prisma.ngoProfile.count({ where: { verificationStatus: 'UNVERIFIED' } }),
    prisma.user.count({ where: { suspended: true } }),
  ]);
  return res.json({ platform, totalUsers, pendingNgoVerifications: pendingNgo, suspendedUsers });
});

// Review decision: the admin reviewed the NGO (documents included) and
// deliberately leaves it UNVERIFIED. The optional reason is stored on
// the profile and shown to the NGO (panel status + notification), the
// decision is audited, and the NGO leaves the review queue until it
// uploads a fresh document. A verified NGO cannot be "kept unverified"
// — it must be unverified through the Unverify action instead (409).
adminRouter.post('/ngo/:userId/keep-unverified', async (req, res, next) => {
  try {
    const { reason } = optionalReasonSchema.parse(req.body ?? {});
    const profile = await prisma.ngoProfile.findUnique({ where: { userId: req.params.userId } });
    if (!profile) return res.status(404).json({ error: 'NGO profile not found' });
    if (profile.verificationStatus === 'VERIFIED') {
      return res.status(409).json({ error: 'NGO is verified — use Unverify to remove verification' });
    }
    await prisma.$transaction(async (tx) => {
      await tx.ngoProfile.update({
        where: { id: profile.id },
        data: {
          verificationNote: reason ?? null,
          verificationReviewedAt: new Date(),
          verificationReviewedById: req.user.id,
        },
      });
      await writeAudit(
        { adminId: req.user.id, action: 'KEEP_NGO_UNVERIFIED', targetType: 'NGO', targetId: req.params.userId, reason },
        tx
      );
      await createNotification(
        {
          userId: req.params.userId,
          type: 'ADMIN_ALERT',
          title: 'Verification reviewed — still unverified',
          body: reason
            ? `An administrator reviewed your verification and kept it unverified. Reason: ${reason} You can upload more documents in the NGO Panel and ask for another review.`
            : 'An administrator reviewed your verification and kept it unverified. You can upload more documents in the NGO Panel and ask for another review.',
        },
        tx
      );
    });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

adminRouter.get('/users', async (req, res) => {
  const q = req.query.q ? String(req.query.q) : null;
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { mobile: { contains: q } },
        ],
      }
    : {};
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      mobile: true,
      role: true,
      accountType: true,
      isMainAdmin: true,
      suspended: true,
      suspensionReason: true,
      createdAt: true,
      ngoProfile: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return res.json({ users });
});

adminRouter.post('/users/:id/suspend', async (req, res, next) => {
  try {
    const { reason } = reasonSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'ADMIN') return res.status(409).json({ error: 'Admin accounts cannot be suspended' });
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: target.id },
        data: { suspended: true, suspensionReason: reason },
      });
      await writeAudit(
        { adminId: req.user.id, action: 'SUSPEND_USER', targetType: 'USER', targetId: target.id, reason },
        tx
      );
      return u;
    });
    return res.json({ user: { id: updated.id, suspended: updated.suspended } });
  } catch (err) {
    return next(err);
  }
});

adminRouter.post('/users/:id/unsuspend', async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: { suspended: false, suspensionReason: null },
      });
      await writeAudit(
        { adminId: req.user.id, action: 'UNSUSPEND_USER', targetType: 'USER', targetId: target.id },
        tx
      );
    });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// Promote a USER account to ADMIN. NGO accounts keep their fixed type
// and are refused, as are accounts that are already admins. Both fields
// change together: accountType drives management, role drives
// requireRole — an ADMIN account's role is fixed (no role switching).
adminRouter.post('/users/:id/promote', async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (isAdminAccount(target)) {
      return res.status(409).json({ error: 'User is already an admin' });
    }
    if (target.accountType === 'NGO') {
      return res.status(409).json({ error: 'NGO accounts cannot be promoted to admin' });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: target.id },
        data: { accountType: 'ADMIN', role: 'ADMIN' },
      });
      await writeAudit(
        { adminId: req.user.id, action: 'PROMOTE_USER', targetType: 'USER', targetId: target.id },
        tx
      );
      return u;
    });
    return res.json({
      user: { id: updated.id, accountType: updated.accountType, role: updated.role },
    });
  } catch (err) {
    return next(err);
  }
});

// Demote an ADMIN back to a USER account (active role CLAIMER). The
// main admin can never be demoted, and the last remaining admin cannot
// be demoted either — the count check and the update run in one
// transaction so two concurrent demotions cannot both pass.
adminRouter.post('/users/:id/demote', async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.isMainAdmin) {
      return res.status(409).json({ error: 'The main admin cannot be demoted' });
    }
    if (!isAdminAccount(target)) {
      return res.status(409).json({ error: 'User is not an admin' });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const admins = await tx.user.count({ where: adminWhere });
      if (admins <= 1) throw new LastAdminError();
      const u = await tx.user.update({
        where: { id: target.id },
        data: { accountType: 'USER', role: 'CLAIMER' },
      });
      await writeAudit(
        { adminId: req.user.id, action: 'DEMOTE_USER', targetType: 'USER', targetId: target.id },
        tx
      );
      return u;
    });
    return res.json({
      user: { id: updated.id, accountType: updated.accountType, role: updated.role },
    });
  } catch (err) {
    if (err instanceof LastAdminError) {
      return res.status(409).json({ error: 'Cannot demote the last remaining admin' });
    }
    return next(err);
  }
});

// Delete a user account and everything it owns, in FK-safe order,
// inside one transaction. Refused for: the main admin, the last
// remaining admin, and any account that has PERFORMED admin actions —
// AuditLog.adminId is a required FK, so deleting an actor would
// destroy append-only audit history; such an account can be demoted
// instead. (Audit rows ABOUT the deleted user survive: targetId is a
// plain string, including the DELETE_USER row written here.)
// Files on disk (avatar, NGO documents, listing photos) are removed
// after the database transaction commits.
adminRouter.delete('/users/:id', async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.isMainAdmin) {
      return res.status(409).json({ error: 'The main admin cannot be deleted' });
    }
    const auditActions = await prisma.auditLog.count({ where: { adminId: target.id } });
    if (auditActions > 0) {
      return res.status(409).json({
        error:
          'This user has performed admin actions recorded in the audit log and cannot be deleted. Demote the account instead.',
      });
    }
    const [docs, listings] = await Promise.all([
      prisma.ngoDocument.findMany({
        where: { userId: target.id },
        select: { storedName: true },
      }),
      prisma.listing.findMany({
        where: { providerId: target.id },
        select: { photoPath: true },
      }),
    ]);
    await prisma.$transaction(async (tx) => {
      if (isAdminAccount(target)) {
        const admins = await tx.user.count({ where: adminWhere });
        if (admins <= 1) throw new LastAdminError();
      }
      // FK-safe order: rows that Restrict the user's own rows go first;
      // claims cascade their live locations and redistribution logs,
      // and the final user delete cascades sessions, reset tokens,
      // notifications, the NGO profile + document rows, and recurring
      // schedules. Invite attribution is SetNull by the schema.
      await tx.redistributionLog.deleteMany({ where: { ngoId: target.id } });
      await tx.claim.deleteMany({ where: { claimerId: target.id } });
      await tx.claim.deleteMany({ where: { listing: { providerId: target.id } } });
      await tx.listing.deleteMany({ where: { providerId: target.id } });
      await writeAudit(
        { adminId: req.user.id, action: 'DELETE_USER', targetType: 'USER', targetId: target.id },
        tx
      );
      await tx.user.delete({ where: { id: target.id } });
    });
    const files = [];
    if (target.profilePhoto) {
      files.push(path.join(AVATARS_DIR, path.basename(target.profilePhoto)));
    }
    for (const d of docs) files.push(path.join(NGO_DOCS_DIR, d.storedName));
    for (const l of listings) {
      if (l.photoPath) files.push(path.join(UPLOADS_DIR, path.basename(l.photoPath)));
    }
    for (const f of files) {
      try {
        await fs.promises.unlink(f);
      } catch {
        // Already gone — file cleanup is best-effort after the commit.
      }
    }
    return res.json({ ok: true });
  } catch (err) {
    if (err instanceof LastAdminError) {
      return res.status(409).json({ error: 'Cannot delete the last remaining admin' });
    }
    return next(err);
  }
});

adminRouter.post('/listings/:id/remove', async (req, res, next) => {
  try {
    const { reason } = reasonSchema.parse(req.body);
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      include: { claims: { where: { status: 'CONFIRMED' } } },
    });
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.status === 'REMOVED_BY_ADMIN') {
      return res.status(409).json({ error: 'Listing already removed' });
    }
    await prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: listing.id },
        data: { status: 'REMOVED_BY_ADMIN', cancelReason: reason },
      });
      for (const claim of listing.claims) {
        await tx.claim.update({
          where: { id: claim.id },
          data: { status: 'CANCELLED_BY_ADMIN', ...clearedCodeFields() },
        });
        await createNotification(
          {
            userId: claim.claimerId,
            type: 'LISTING_CANCELLED',
            title: 'A listing you claimed was removed',
            body: `"${listing.foodName}" was removed by an administrator: ${reason}`,
            relatedListingId: listing.id,
            relatedClaimId: claim.id,
          },
          tx
        );
      }
      await createNotification(
        {
          userId: listing.providerId,
          type: 'ADMIN_ALERT',
          title: 'Your listing was removed by an administrator',
          body: `"${listing.foodName}" was removed: ${reason}`,
          relatedListingId: listing.id,
        },
        tx
      );
      await writeAudit(
        { adminId: req.user.id, action: 'REMOVE_LISTING', targetType: 'LISTING', targetId: listing.id, reason },
        tx
      );
    });
    return res.json({ ok: true, cancelledClaims: listing.claims.length });
  } catch (err) {
    return next(err);
  }
});

// ── NGO verification queue (FR-16) ──────────────────────────────────────────
adminRouter.get('/ngo/pending', async (req, res) => {
  const profiles = await prisma.ngoProfile.findMany({
    // The review queue holds unverified NGOs still awaiting a decision;
    // a keep-unverified decision (verificationReviewedAt set) takes the
    // NGO out until it uploads a fresh document.
    where: { verificationStatus: 'UNVERIFIED', verificationReviewedAt: null },
    include: { user: { select: { id: true, name: true, email: true, mobile: true, createdAt: true } } },
    orderBy: { createdAt: 'asc' },
  });
  // Attach each NGO's verification documents (metadata only — the bytes
  // are served solely by the admin download endpoint below).
  const userIds = profiles.map((p) => p.userId);
  const docs = userIds.length
    ? await prisma.ngoDocument.findMany({
        where: { userId: { in: userIds } },
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const byUser = new Map();
  for (const d of docs) {
    if (!byUser.has(d.userId)) byUser.set(d.userId, []);
    byUser.get(d.userId).push({
      id: d.id, originalName: d.originalName, mimeType: d.mimeType,
      sizeBytes: d.sizeBytes, createdAt: d.createdAt,
    });
  }
  return res.json({
    pending: profiles.map((p) => ({ ...p, documents: byUser.get(p.userId) ?? [] })),
  });
});

// Verification document download — admin only (this router is
// ADMIN-gated). The file is streamed from the private directory with
// its original name; documents are never reachable by public URL.
adminRouter.get('/ngo-documents/:id', async (req, res) => {
  const doc = await prisma.ngoDocument.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const filePath = path.join(NGO_DOCS_DIR, doc.storedName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Document file is missing' });
  }
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${doc.originalName.replaceAll('"', '')}"`);
  return res.sendFile(filePath);
});

adminRouter.post('/ngo/:userId/verify', async (req, res, next) => {
  try {
    optionalReasonSchema.parse(req.body ?? {});
    const profile = await prisma.ngoProfile.findUnique({ where: { userId: req.params.userId } });
    if (!profile) return res.status(404).json({ error: 'NGO profile not found' });
    await prisma.$transaction(async (tx) => {
      await tx.ngoProfile.update({
        where: { id: profile.id },
        data: {
          verificationStatus: 'VERIFIED', verifiedById: req.user.id, verifiedAt: new Date(),
          verificationNote: null, verificationReviewedAt: null, verificationReviewedById: null,
        },
      });
      await writeAudit(
        { adminId: req.user.id, action: 'VERIFY_NGO', targetType: 'NGO', targetId: req.params.userId },
        tx
      );
      await createNotification(
        {
          userId: req.params.userId,
          type: 'ADMIN_ALERT',
          title: 'Your NGO is now verified',
          body: 'An administrator verified your organisation. Your listings and claims now show a Verified NGO label.',
        },
        tx
      );
    });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

adminRouter.post('/ngo/:userId/unverify', async (req, res, next) => {
  try {
    const { reason } = optionalReasonSchema.parse(req.body ?? {});
    const profile = await prisma.ngoProfile.findUnique({ where: { userId: req.params.userId } });
    if (!profile) return res.status(404).json({ error: 'NGO profile not found' });
    await prisma.$transaction(async (tx) => {
      await tx.ngoProfile.update({
        where: { id: profile.id },
        data: {
          verificationStatus: 'UNVERIFIED', verifiedById: null, verifiedAt: null,
          verificationNote: null, verificationReviewedAt: null, verificationReviewedById: null,
        },
      });
      await writeAudit(
        { adminId: req.user.id, action: 'UNVERIFY_NGO', targetType: 'NGO', targetId: req.params.userId, reason },
        tx
      );
    });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

adminRouter.get('/audit', async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    include: { admin: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return res.json({ audit: logs });
});
