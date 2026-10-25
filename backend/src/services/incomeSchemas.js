
import { z } from 'zod';

const amountSchema = z.coerce
  .number()
  .finite('Amount must be a valid number')
  .positive('Amount must be greater than zero')
  .max(9999999999.99, 'Amount is too large');

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime())
      && date.toISOString().slice(0, 10) === value;
  }, 'Enter a valid date');

const sourceSchema = z.string()
  .trim()
  .min(1, 'Income source is required')
  .max(100, 'Income source must not exceed 100 characters');

const noteSchema = z.string()
  .trim()
  .max(255, 'Note must not exceed 255 characters')
  .nullable()
  .optional()
  .transform((value) => value || null);

export const createIncomeSchema = z.object({
  amount: amountSchema,
  source: sourceSchema,
  received_on: dateSchema,
  is_recurring: z.boolean().default(false),
  note: noteSchema,
});

export const updateIncomeSchema = z.object({
  amount: amountSchema,
  source: sourceSchema,
  received_on: dateSchema,
  is_recurring: z.boolean(),
  note: noteSchema,
});
