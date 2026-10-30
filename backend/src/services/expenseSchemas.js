
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
  }, 'Enter a valid date')
  .refine((value) => {
    const today = new Date();
    const todayString = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');

    return value <= todayString;
  }, 'Expense date cannot be in the future');

const noteSchema = z.string()
  .trim()
  .max(255, 'Note must not exceed 255 characters')
  .nullable()
  .optional()
  .transform((value) => value || null);

const merchantSchema = z.string()
  .trim()
  .max(100, 'Merchant name must not exceed 100 characters')
  .nullable()
  .optional()
  .transform((value) => value || null);

export const createExpenseSchema = z.object({
  amount: amountSchema,
  // Optional (FR05): leave it out and the category is suggested from the
  // merchant name. A category the user picks always wins.
  category_id: z.string().uuid('Enter a valid category ID')
    .nullish()
    .transform((value) => value ?? undefined),
  spent_on: dateSchema,
  note: noteSchema,
  merchant: merchantSchema,
});

export const updateExpenseSchema = createExpenseSchema;
