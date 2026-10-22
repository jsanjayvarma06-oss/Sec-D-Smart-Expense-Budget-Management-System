
import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string()
    .trim()
    .min(1, 'Category name is required')
    .max(50, 'Category name must not exceed 50 characters')
    .transform((value) => value.replace(/\s+/g, ' ')),
});

export const updateCategorySchema = createCategorySchema;
