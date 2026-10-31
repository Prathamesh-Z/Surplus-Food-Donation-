import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { normalizeMobile } from '../validators/auth.js';
import { AVATARS_DIR } from '../lib/uploads.js';
import { publicUser } from '../services/authService.js';

export const usersRouter = Router();

const languageSchema = z.object({ language: z.enum(['EN', 'MR', 'HI']) });

const contactSchema = z.object({
  // Same rule as registration (validators/auth.js): 10-digit Indian mobile,
  // with the same input normalization (+91 / spaces / leading 0 tolerated).
  mobile: z.preprocess(normalizeMobile, z.string().regex(/^[6-9]\d{9}$/, 'Mobile must be a 10-digit Indian number')),
});

// v3.4: view/update the signed-in user's own contact number. The user id
// comes from the auth token only — nobody can edit another user's number.
usersRouter.patch('/me/contact', requireAuth, async (req, res, next) => {
  try {
    const { mobile } = contactSchema.parse(req.body);
    const taken = await prisma.user.findFirst({
      where: { mobile, NOT: { id: req.user.id } },
    });
    if (taken) {
      return res.status(409).json({ error: 'That mobile number is already registered to another account' });
    }
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { mobile },
    });
    return res.json({ mobile: updated.mobile });
  } catch (err) {
    return next(err);
  }
});

const nameSchema = z.object({
  // Same rule as registration (validators/auth.js): a non-blank name,
  // stored trimmed exactly as at registration.
  name: z.string().trim().min(1, 'Name is required'),
});

// Profile name editing: updates ONLY the caller's own display name —
// the user id comes from the auth token, as with contact and language.
usersRouter.patch('/me/name', requireAuth, async (req, res, next) => {
  try {
    const { name } = nameSchema.parse(req.body);
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { name },
    });
    return res.json({ name: updated.name });
  } catch (err) {
    return next(err);
  }
});

// PRD FR-19: the language toggle persists per account (users.languagePref).
usersRouter.patch('/me/language', requireAuth, async (req, res, next) => {
  try {
    const { language } = languageSchema.parse(req.body);
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { languagePref: language },
    });
    return res.json({ languagePref: updated.languagePref });
  } catch (err) {
    return next(err);
  }
});

// ── Profile photo ──────────────────────────────────────────────────────
// Optional avatar for the signed-in user (POST sets/changes, DELETE
// removes back to the default silhouette). Same storage approach as
// listing photos (local disk under /uploads, random filename) in its
// own avatars/ subfolder. Validation follows the strict pattern: a
// JPEG/PNG/WebP allowlist in multer PLUS a magic-byte check of the
// actual contents — the client-provided type is never trusted alone.
// 5 MB cap, like listing photos. The endpoints are /me-scoped: there
// is no way to address another user's photo.
const PHOTO_TYPES = {
  'image/jpeg': { ext: '.jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  'image/png': { ext: '.png', magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/webp': { ext: '.webp', magic: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
};
const photoUpload = multer({
  storage: multer.diskStorage({
    destination: AVATARS_DIR,
    filename: (req, file, cb) => {
      const spec = PHOTO_TYPES[file.mimetype];
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${spec ? spec.ext : ''}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB, same cap as listing photos
  fileFilter: (req, file, cb) => {
    if (!PHOTO_TYPES[file.mimetype]) {
      const err = new Error('Profile photo must be a JPEG, PNG or WebP image');
      err.status = 422;
      return cb(err);
    }
    return cb(null, true);
  },
});

function uploadPhoto(req, res, next) {
  photoUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        err.status = 413;
        err.message = 'Profile photo exceeds the 5 MB size limit';
      }
      return next(err);
    }
    return next();
  });
}

function deletePhotoFile(servedPath) {
  if (!servedPath) return;
  const name = path.basename(servedPath);
  fs.unlink(path.join(AVATARS_DIR, name), () => {});
}

usersRouter.post('/me/photo', requireAuth, uploadPhoto, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(422).json({ error: 'No file was uploaded' });
    }
    const head = fs.readFileSync(req.file.path).subarray(0, 12);
    if (!PHOTO_TYPES[req.file.mimetype].magic(head)) {
      fs.unlink(req.file.path, () => {});
      return res.status(422).json({ error: 'File contents do not match its declared type' });
    }
    const previous = req.user.profilePhoto;
    const servedPath = `/uploads/avatars/${req.file.filename}`;
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { profilePhoto: servedPath },
    });
    deletePhotoFile(previous); // changing a photo never orphans the old file
    return res.json({ user: publicUser(updated) });
  } catch (err) {
    return next(err);
  }
});

usersRouter.delete('/me/photo', requireAuth, async (req, res, next) => {
  try {
    const previous = req.user.profilePhoto;
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { profilePhoto: null },
    });
    deletePhotoFile(previous);
    return res.json({ user: publicUser(updated) });
  } catch (err) {
    return next(err);
  }
});
