import { z } from 'zod';
import { CATEGORIES, DIETARY_TYPES, PORTION_TYPES } from './listings.js';

// PRD FR-18 — the schedule template carries everything a real listing
// needs except totalPortions and the checklist, which must be supplied
// fresh for each occurrence on the day.
export const scheduleSchema = z.object({
  title: z.string().trim().min(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  generationTimeLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM 24-hour'),
  deadlineOffsetMinutes: z.number().int().min(15).max(23 * 60).optional().default(180),
  template: z.object({
    foodName: z.string().trim().min(1),
    foodDetails: z.string().trim().min(1),
    category: z.enum(CATEGORIES),
    dietaryType: z.enum(DIETARY_TYPES),
    portionType: z.enum(PORTION_TYPES),
    ngoSuitable: z.boolean().optional().default(false),
    pickupLocationText: z.string().trim().min(1),
  }),
});

export const DESTINATION_TYPES = [
  'SHELTER',
  'COMMUNITY_KITCHEN',
  'OLD_AGE_HOME',
  'SCHOOL',
  'INDIVIDUALS',
  'OTHER',
];

export const redistributionSchema = z.object({
  claimId: z.string().uuid(),
  destinationName: z.string().trim().min(1),
  destinationType: z.enum(DESTINATION_TYPES),
  portions: z.number().int().min(1),
  redistributedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const redistributionEditSchema = z.object({
  destinationName: z.string().trim().min(1).optional(),
  destinationType: z.enum(DESTINATION_TYPES).optional(),
  portions: z.number().int().min(1).optional(),
  notes: z.string().trim().max(500).optional(),
});
