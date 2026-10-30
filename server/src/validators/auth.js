import { z } from 'zod';

/**
 * Normalize an Indian mobile as users actually type it: spaces, hyphens,
 * a +91 / 91 country prefix, or a leading 0 are stripped before the strict
 * 10-digit check. (v3.6 — registration previously rejected all of these
 * with an unexplained "Validation failed".)
 */
export function normalizeMobile(v) {
  if (typeof v !== 'string') return v;
  let d = v.replace(/[\s-]/g, '').replace(/^\+/, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

const emptyToUndefined = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

// PRD FR-01 — registration validation. Public registration can never create ADMIN.
export const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    email: z.string().trim().email('Invalid email'),
    mobile: z.preprocess(normalizeMobile, z.string().regex(/^[6-9]\d{9}$/, 'Mobile must be a 10-digit Indian number')),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(['PROVIDER', 'CLAIMER', 'NGO']),
    inviteCode: z.string().trim().min(1).max(32).optional(),
    organisationName: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
    registrationDetail: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
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

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Invalid email'),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
