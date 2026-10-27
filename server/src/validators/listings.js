import { z } from 'zod';

export const CATEGORIES = [
  'COOKED_MEALS',
  'RAW_PRODUCE',
  'BAKERY',
  'DAIRY',
  'PACKAGED_FOOD',
  'BEVERAGES',
  'OTHER',
];
export const DIETARY_TYPES = ['VEG', 'NON_VEG', 'VEGAN'];
export const PORTION_TYPES = ['INDIVIDUAL_MEALS', 'BULK_SERVINGS', 'KILOGRAMS', 'LITRES', 'PACKETS'];

// PRD FR-04 — create listing. Deadline must be in the future and within 24h
// of creation (stated default in the PRD); cookedAt must not be in the future.
export const createListingSchema = z
  .object({
    foodName: z.string().trim().min(1),
    foodDetails: z.string().trim().min(1),
    category: z.enum(CATEGORIES),
    dietaryType: z.enum(DIETARY_TYPES),
    portionType: z.enum(PORTION_TYPES),
    totalPortions: z.number().int().min(1),
    ngoSuitable: z.boolean().optional().default(false),
    pickupLocationText: z.string().trim().min(1),
    cookedAt: z.string().datetime(),
    collectionDeadline: z.string().datetime(),
    checklistItems: z.array(z.string()).optional().default([]),
    recurringScheduleId: z.string().uuid().optional(),
  })
  .refine((d) => new Date(d.cookedAt) <= new Date(), {
    message: 'cookedAt cannot be in the future',
    path: ['cookedAt'],
  })
  .refine((d) => new Date(d.collectionDeadline) > new Date(), {
    message: 'collectionDeadline must be in the future',
    path: ['collectionDeadline'],
  })
  .refine((d) => new Date(d.collectionDeadline) <= new Date(Date.now() + 24 * 60 * 60 * 1000), {
    message: 'collectionDeadline must be within 24 hours of creation',
    path: ['collectionDeadline'],
  });

export const editListingSchema = z.object({
  foodName: z.string().trim().min(1).optional(),
  foodDetails: z.string().trim().min(1).optional(),
  category: z.enum(CATEGORIES).optional(),
  dietaryType: z.enum(DIETARY_TYPES).optional(),
  portionType: z.enum(PORTION_TYPES).optional(),
  totalPortions: z.number().int().min(1).optional(),
  ngoSuitable: z.boolean().optional(),
  pickupLocationText: z.string().trim().min(1).optional(),
  cookedAt: z.string().datetime().optional(),
  collectionDeadline: z.string().datetime().optional(),
  checklistItems: z.array(z.string()).optional(),
});

export const cancelListingSchema = z.object({
  reason: z.string().trim().min(3, 'A cancellation reason of at least 3 characters is required'),
});
