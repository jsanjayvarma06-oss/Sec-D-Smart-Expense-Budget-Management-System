
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

export const forgotPasswordSchema = z.object({
  email: registerSchema.shape.email,
});

// A new password follows the same rule as registration.
export const resetPasswordSchema = z.object({
  token: z.string().min(20, 'This reset link is invalid or has expired').max(200),
  password: registerSchema.shape.password,
});

// The 6-digit code from an authenticator app. Spaces are allowed, as some apps
// show the code as "123 456".
export const twoFactorCodeSchema = z.object({
  code: z.string()
    .transform((value) => value.replace(/\s/g, ''))
    .pipe(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your app')),
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
