import { z } from 'zod';

const amountSchema = z.coerce
  .number()
  .finite('Amount must be a valid number')
  .positive('Amount must be greater than zero')
  .max(9999999999.99, 'Amount is too large');

const savedAmountSchema = z.coerce
  .number()
  .finite('Saved amount must be a valid number')
  .min(0, 'Saved amount cannot be negative')
  .max(9999999999.99, 'Saved amount is too large');

const nameSchema = z.string()
  .trim()
  .min(1, 'Goal name is required')
  .max(100, 'Goal name must not exceed 100 characters');

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime())
      && date.toISOString().slice(0, 10) === value;
  }, 'Enter a valid date')
  .nullable()
  .optional()
  .transform((value) => value || null);

export const createSavingsGoalSchema = z.object({
  name: nameSchema,
  target_amount: amountSchema,
  saved_amount: savedAmountSchema.default(0),
  target_date: dateSchema,
});

export const updateSavingsGoalSchema = z.object({
  name: nameSchema,
  target_amount: amountSchema,
  saved_amount: savedAmountSchema,
  target_date: dateSchema,
  status: z.enum(['active', 'completed', 'archived']).optional(),
});