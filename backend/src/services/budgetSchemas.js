
import { z } from 'zod';

const amountSchema = z.coerce
  .number()
  .finite('Budget must be a valid number')
  .positive('Budget must be greater than zero')
  .max(9999999999.99, 'Budget is too large');

const monthSchema = z.string()
  .regex(/^\d{4}-\d{2}$/, 'Month must use YYYY-MM format')
  .refine((value) => {
    const [year, month] = value.split('-').map(Number);
    return year >= 1900 && month >= 1 && month <= 12;
  }, 'Enter a valid month');

export const createBudgetSchema = z.object({
  month: monthSchema,
  amount: amountSchema,
  category_id: z.string().uuid('Enter a valid category ID')
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

export const updateBudgetSchema = z.object({
  amount: amountSchema,
});
