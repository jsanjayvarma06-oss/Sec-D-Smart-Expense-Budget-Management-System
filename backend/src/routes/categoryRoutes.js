
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import {
  createCategorySchema,
  updateCategorySchema,
} from '../services/categorySchemas.js';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../services/categoryService.js';
import { HttpError } from '../utils/httpError.js';

const categoryIdSchema = z.string().uuid();

function validateCategoryId(id) {
  const result = categoryIdSchema.safeParse(id);

  if (!result.success) {
    throw new HttpError(400, 'Invalid category ID', {
      code: 'VALIDATION',
    });
  }

  return result.data;
}

export function categoryRoutes() {
  const router = Router();

  // List built-in default categories and this user's custom categories.
  router.get('/', async (req, res, next) => {
    try {
      const categories = await listCategories(req.user.id);
      res.json({ categories });
    } catch (err) {
      next(err);
    }
  });

  // Create a custom category for the logged-in user.
  router.post('/', validate(createCategorySchema), async (req, res, next) => {
    try {
      const category = await createCategory(req.user.id, req.body);

      if (!category) {
        throw new HttpError(409, 'A category with this name already exists', {
          code: 'CATEGORY_EXISTS',
        });
      }

      res.status(201).json({ category });
    } catch (err) {
      next(err);
    }
  });

  // Update only a category owned by the logged-in user.
  router.put('/:id', validate(updateCategorySchema), async (req, res, next) => {
    try {
      const categoryId = validateCategoryId(req.params.id);
      const result = await updateCategory(
        req.user.id,
        categoryId,
        req.body,
      );

      if (result?.error === 'CATEGORY_EXISTS') {
        throw new HttpError(409, 'A category with this name already exists', {
          code: 'CATEGORY_EXISTS',
        });
      }

      if (!result) {
        throw new HttpError(404, 'Custom category not found');
      }

      res.json({ category: result.category });
    } catch (err) {
      next(err);
    }
  });

  // Delete only a category owned by the logged-in user.
  router.delete('/:id', async (req, res, next) => {
    try {
      const categoryId = validateCategoryId(req.params.id);
      const deleted = await deleteCategory(req.user.id, categoryId);

      if (!deleted) {
        throw new HttpError(404, 'Custom category not found');
      }

      res.status(204).end();
    } catch (err) {
      // 23503: expenses, budgets or recurring payments still point at it.
      if (err.code === '23503') {
        return next(new HttpError(
          409,
          'This category is used by expenses, budgets or recurring payments. Move or delete those first.',
          { code: 'CATEGORY_IN_USE' },
        ));
      }
      next(err);
    }
  });

  return router;
}
