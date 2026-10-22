
import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string()
    .trim()
    .min(2, 'Name must contain at least 2 characters')
    .max(100, 'Name must not exceed 100 characters'),

  email: z.string()
    .trim()
    .email('Enter a valid email address')
    .max(254, 'Email must not exceed 254 characters')
    .transform((value) => value.toLowerCase()),

  password: z.string()
    .min(8, 'Password must contain at least 8 characters')
    .refine(
      (value) => Buffer.byteLength(value, 'utf8') <= 72,
      'Password must not exceed 72 bytes',
    ),
});

export const loginSchema = z.object({
  email: z.string()
    .trim()
    .email('Enter a valid email address')
    .max(254, 'Email must not exceed 254 characters')
    .transform((value) => value.toLowerCase()),

  password: z.string()
    .min(1, 'Password is required'),
});
