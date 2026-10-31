import { Router } from 'express';
import { z } from 'zod';
import { getMonthlyExpenseReport } from '../services/reportService.js';
import { HttpError } from '../utils/httpError.js';

const reportQuerySchema = z.object({
  month: z.string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must use YYYY-MM format')
    .refine((value) => Number(value.slice(0, 4)) >= 1900, {
      message: 'Enter a valid month',
    }),
  format: z.literal('csv'),
}).strict();

function csvCell(value) {
  let text = value == null ? '' : String(value);

  // Prevent spreadsheet formula injection in text fields.
  if (/^[\t\r ]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  // Escape quotes and wrap every cell in double quotes.
  return `"${text.replace(/"/g, '""')}"`;
}

function createCsv(expenses) {
  const headers = [
    'Date',
    'Merchant',
    'Category',
    'Note',
    'Amount',
  ];

  const rows = expenses.map((expense) => [
    expense.spent_on,
    expense.merchant,
    expense.category_name,
    expense.note,
    expense.amount,
  ]);

  return [
    headers.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ].join('\r\n');
}

export function reportRoutes() {
  const router = Router();

  router.get('/export', async (req, res, next) => {
    try {
      const parsed = reportQuerySchema.safeParse(req.query);

      if (!parsed.success) {
        throw new HttpError(
          400,
          'Provide a valid month (YYYY-MM) and format (csv)',
          { code: 'VALIDATION' },
        );
      }

      const { month } = parsed.data;

      const expenses = await getMonthlyExpenseReport(
        req.user.id,
        month,
      );

      const csv = `\uFEFF${createCsv(expenses)}`;

      res
        .status(200)
        .set({
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition':
            `attachment; filename="expense-report-${month}.csv"`,
        })
        .send(csv);
    } catch (err) {
      next(err);
    }
  });

  return router;
}