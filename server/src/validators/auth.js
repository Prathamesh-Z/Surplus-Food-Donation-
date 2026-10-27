import { z } from 'zod';

// PRD FR-01 — registration validation. Public registration can never create ADMIN.
export const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    email: z.string().trim().email('Invalid email'),
    mobile: z.string().regex(/^[6-9]\d{9}$/, 'Mobile must be a 10-digit Indian number'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(['PROVIDER', 'CLAIMER', 'NGO']),
    organisationName: z.string().trim().min(1).optional(),
    registrationDetail: z.string().trim().min(1).optional(),
  })
  .refine((d) => d.role !== 'NGO' || Boolean(d.organisationName), {
    message: 'organisationName is required for NGO registration',
    path: ['organisationName'],
  })
  .refine((d) => d.role !== 'NGO' || Boolean(d.registrationDetail), {
    message: 'registrationDetail is required for NGO registration',
    path: ['registrationDetail'],
  });

export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
