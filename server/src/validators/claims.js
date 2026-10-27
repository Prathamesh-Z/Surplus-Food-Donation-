import { z } from 'zod';

// PRD FR-09: portions must be a positive integer — 0, negatives and
// non-integers are rejected before any stock check runs.
export const createClaimSchema = z.object({
  listingId: z.string().uuid(),
  portions: z.number().int().min(1),
});

export const verifyClaimSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .pipe(z.string().length(8)),
});
