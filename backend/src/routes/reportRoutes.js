
import { Router } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { getMonthlyReportData } from '../services/reportService.js';
import { getMonthlyExpenseReport } from '../services/reportService.js';
import { HttpError } from '../utils/httpError.js';

const reportQuerySchema = z.object({
  month: z.string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must use YYYY-MM format')
    .refine((value) => Number(value.slice(0, 4)) >= 1900, {
      message: 'Enter a valid month',
    }),
  format: z.enum(['csv', 'pdf']),
}).strict();

function csvCell(value) {
  let text = value == null ? '' : String(value);

  if (/^[\t\r ]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

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

function formatMoney(value) {
  return `INR ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  return String(value || '').slice(0, 10);
}

function createPdf(res, month, expenses, remainingBudgets) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 45,
    bufferPages: true,
    info: {
      Title: `Expense Report - ${month}`,
      Author: 'Smart Expense & Budget Management System',
      Subject: 'Monthly expense and budget report',
    },
  });

  doc.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500);
    }
    res.destroy(err);
  });

  res.status(200).set({
    'Content-Type': 'application/pdf',
    'Content-Disposition':
      `attachment; filename="expense-report-${month}.pdf"`,
  });

  doc.pipe(res);

  const overallBudget = remainingBudgets.find(
    (budget) => budget.category_id === null,
  );

  const categoryBudgets = remainingBudgets.filter(
    (budget) => budget.category_id !== null,
  );

  const totalSpent = expenses.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0,
  );

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString(
    'en-IN',
    { month: 'long', year: 'numeric' },
  );

  const categoryTotals = new Map();

  for (const expense of expenses) {
    const name = expense.category_name || 'Uncategorized';
    categoryTotals.set(
      name,
      (categoryTotals.get(name) || 0) + Number(expense.amount || 0),
    );
  }

  const categoryBudgetMap = new Map(
    categoryBudgets.map((budget) => [
      budget.category_name,
      budget,
    ]),
  );

  doc
    .fillColor('#2457d6')
    .fontSize(10)
    .font('Helvetica-Bold')
    .text('PERSONAL FINANCE');

  doc.moveDown(0.5);

  doc
    .fillColor('#172b4d')
    .fontSize(22)
    .text('Monthly Expense Report');

  doc
    .fillColor('#667085')
    .fontSize(11)
    .font('Helvetica')
    .text(monthLabel);

  doc.moveDown(1.5);

  doc
    .fillColor('#172b4d')
    .font('Helvetica-Bold')
    .fontSize(14)
    .text('Monthly Summary');

  doc.moveDown(0.7);

  const summaryItems = [
    ['Total spent', formatMoney(totalSpent)],
    [
      'Monthly budget',
      overallBudget
        ? formatMoney(overallBudget.budget_amount)
        : 'Not set',
    ],
    [
      'Remaining budget',
      overallBudget
        ? formatMoney(overallBudget.remaining_amount)
        : 'Not set',
    ],
    ['Number of expenses', String(expenses.length)],
  ];

  for (const [label, value] of summaryItems) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#667085')
      .text(label, { continued: true });

    doc
      .font('Helvetica-Bold')
      .fillColor('#172b4d')
      .text(`  ${value}`);
  }

  doc.moveDown(1.5);

  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor('#172b4d')
    .text('Category-wise Spending');

  doc.moveDown(0.6);

  const categories = [...categoryTotals.entries()]
    .sort((a, b) => b[1] - a[1]);

  if (categories.length === 0) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#667085')
      .text('No expenses recorded for this month.');
  } else {
    for (const [name, spent] of categories) {
      const budget = categoryBudgetMap.get(name);

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#344054')
        .text(
          `${name}: ${formatMoney(spent)}`
          + (budget
            ? `  |  Budget: ${formatMoney(budget.budget_amount)}`
            : '  |  Budget: Not set'),
        );
    }
  }

  doc.moveDown(1.5);

  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor('#172b4d')
    .text('Expense Details');

  doc.moveDown(0.6);

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const widths = [75, 135, 115, right - left - 75 - 135 - 115];

  function drawExpenseHeader() {
    const y = doc.y;

    doc
      .rect(left, y, right - left, 22)
      .fill('#edf2fa');

    doc
      .fillColor('#344054')
      .font('Helvetica-Bold')
      .fontSize(9);

    let x = left + 5;
    ['Date', 'Merchant', 'Category', 'Amount'].forEach((heading, index) => {
      doc.text(heading, x, y + 6, {
        width: widths[index] - 8,
      });
      x += widths[index];
    });

    doc.y = y + 28;
  }

  drawExpenseHeader();

  if (expenses.length === 0) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#667085')
      .text('No expense records available.');
  }

  for (const expense of expenses) {
    const merchant = expense.merchant || 'Expense';
    const category = expense.category_name || 'Uncategorized';
    const date = formatDate(expense.spent_on);
    const amount = formatMoney(expense.amount);

    const rowHeight = 28;

    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawExpenseHeader();
    }

    const y = doc.y;
    let x = left + 5;

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#344054');

    [date, merchant, category, amount].forEach((value, index) => {
      doc.text(value, x, y, {
        width: widths[index] - 8,
        height: rowHeight,
        ellipsis: true,
      });
      x += widths[index];
    });

    doc
      .moveTo(left, y + rowHeight - 5)
      .lineTo(right, y + rowHeight - 5)
      .strokeColor('#e4e7ec')
      .stroke();

    doc.y = y + rowHeight;
  }

  const range = doc.bufferedPageRange();

  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#98a2b3')
      .text(
        `Smart Expense & Budget Management System  |  Page ${index + 1} of ${range.count}`,
        left,
        doc.page.height - 30,
        {
          width: right - left,
          align: 'center',
        },
      );
  }

  doc.end();
}

export function reportRoutes() {
  const router = Router();

  router.get('/export', async (req, res, next) => {
    try {
      const parsed = reportQuerySchema.safeParse(req.query);

      if (!parsed.success) {
        throw new HttpError(
          400,
          'Provide a valid month (YYYY-MM) and format (csv or pdf)',
          { code: 'VALIDATION' },
        );
      }

      const { month, format } = parsed.data;

      if (format === 'csv') {
        const expenses = await getMonthlyExpenseReport(
          req.user.id,
          month,
        );
        if (expenses.length === 0) {
          return res.status(204).end();
        }
        const csv = `\uFEFF${createCsv(expenses)}`;

        return res
          .status(200)
          .set({
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition':
              `attachment; filename="expense-report-${month}.csv"`,
          })
          .send(csv);
      }

      const { expenses, remainingBudgets } =
        await getMonthlyReportData(req.user.id, month);

      return createPdf(res, month, expenses, remainingBudgets);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
