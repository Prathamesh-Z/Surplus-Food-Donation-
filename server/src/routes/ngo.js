import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { NGO_DOCS_DIR } from '../lib/uploads.js';
import {
  redistributionSchema,
  redistributionEditSchema,
} from '../validators/p1.js';

// PRD FR-17 — NGO redistribution log. Entries are credited to this NGO
// (never to the provider), and the logged total for a claim can never
// exceed the portions that NGO actually collected on it.
export const ngoRouter = Router();
ngoRouter.use(requireAuth, requireRole('NGO'));

// ── Verification documents ─────────────────────────────────────────────
// Certificates / registration proofs for the admin verification
// workflow. Multiple files per submission, 20 MB per file; PDF, JPEG
// and PNG only — the declared type is checked by multer AND every
// file's magic bytes are verified after upload, so a renamed file
// cannot pass. A batch is atomic: if any file fails validation, all
// files of the batch are removed and nothing is recorded. Files land
// in NGO_DOCS_DIR, which is never statically served.
const DOC_TYPES = {
  'application/pdf': { ext: '.pdf', magic: (b) => b.subarray(0, 4).toString('latin1') === '%PDF' },
  'image/jpeg': { ext: '.jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  'image/png': { ext: '.png', magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
};
const docUpload = multer({
  storage: multer.diskStorage({
    destination: NGO_DOCS_DIR,
    filename: (req, file, cb) => {
      const spec = DOC_TYPES[file.mimetype];
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${spec ? spec.ext : ''}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 }, // 20 MB per file, ≤10 files per submission
  fileFilter: (req, file, cb) => {
    if (!DOC_TYPES[file.mimetype]) {
      const err = new Error('Document must be a PDF, JPEG or PNG file');
      err.status = 422;
      return cb(err);
    }
    return cb(null, true);
  },
});

function uploadDocuments(req, res, next) {
  docUpload.array('file', 10)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        err.status = 413;
        err.message = 'A document exceeds the 20 MB size limit';
      } else if (err.code === 'LIMIT_FILE_COUNT') {
        err.status = 422;
        err.message = 'Too many files — at most 10 documents per submission';
      }
      return next(err);
    }
    return next();
  });
}

const docView = (d) => ({
  id: d.id,
  originalName: d.originalName,
  mimeType: d.mimeType,
  sizeBytes: d.sizeBytes,
  createdAt: d.createdAt,
});

ngoRouter.post('/documents', uploadDocuments, async (req, res, next) => {
  const files = req.files ?? [];
  const cleanup = () => {
    for (const f of files) fs.unlink(f.path, () => {});
  };
  try {
    if (files.length === 0) {
      return res.status(422).json({ error: 'No files were uploaded' });
    }
    // Verify every file's magic bytes BEFORE recording anything — a
    // single bad file rejects the whole batch (no partial uploads,
    // no orphaned files or rows).
    for (const f of files) {
      const head = fs.readFileSync(f.path).subarray(0, 12);
      if (!DOC_TYPES[f.mimetype].magic(head)) {
        cleanup();
        return res.status(422).json({
          error: `File "${path.basename(f.originalname)}" contents do not match its declared type`,
        });
      }
    }
    const docs = await prisma.$transaction(
      files.map((f) =>
        prisma.ngoDocument.create({
          data: {
            userId: req.user.id,
            originalName: path.basename(f.originalname).slice(0, 200),
            storedName: f.filename,
            mimeType: f.mimetype,
            sizeBytes: f.size,
          },
        }),
      ),
    );
    // A fresh submission asks for a new review: if an admin previously
    // kept this NGO unverified, it re-enters the review queue. The last
    // decision's note stays visible to the NGO until the next decision.
    await prisma.ngoProfile.updateMany({
      where: { userId: req.user.id },
      data: { verificationReviewedAt: null, verificationReviewedById: null },
    });
    return res.status(201).json({ documents: docs.map(docView) });
  } catch (err) {
    cleanup();
    return next(err);
  }
});

ngoRouter.get('/documents', async (req, res) => {
  const docs = await prisma.ngoDocument.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ documents: docs.map(docView) });
});

ngoRouter.delete('/documents/:id', async (req, res) => {
  const doc = await prisma.ngoDocument.findUnique({ where: { id: req.params.id } });
  if (!doc || doc.userId !== req.user.id) {
    return res.status(404).json({ error: 'Document not found' });
  }
  await prisma.ngoDocument.delete({ where: { id: doc.id } });
  fs.unlink(path.join(NGO_DOCS_DIR, doc.storedName), () => {});
  return res.json({ ok: true });
});

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
