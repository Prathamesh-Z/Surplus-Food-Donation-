import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const usersRouter = Router();

const languageSchema = z.object({ language: z.enum(['EN', 'MR']) });

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
