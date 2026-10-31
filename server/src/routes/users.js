import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { normalizeMobile } from '../validators/auth.js';

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
