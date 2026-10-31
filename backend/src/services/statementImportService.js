// Bank statement CSV import service (story #99, cards #100, #101, #102).
// Supports SBI, HDFC, ICICI, and generic CSV layouts.
// All imports are atomic (all-or-nothing) inside withUser.

import { withUser } from '../db/userScope.js';
import { HttpError } from '../utils/httpError.js';
import { suggestCategoryName } from './merchantCategoryService.js';
import { listCategories } from './categoryService.js';

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB

// Robust CSV row splitter handling quotes and commas
export function parseCSVLines(text) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let cell = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      row.push(cell.trim());
      cell = '';
      if (row.some((c) => c !== '')) {
        lines.push(row);
      }
      row = [];
    } else {
      cell += char;
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell.trim());
    if (row.some((c) => c !== '')) {
      lines.push(row);
    }
  }

  return lines;
}

// Normalizes header string to help detect columns
function cleanHeader(header) {
  return String(header ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Identifies column indexes for date, description, and debit amount (#100)
export function detectLayout(headers) {
  let dateIndex = -1;
  let descIndex = -1;
  let debitIndex = -1;
  let creditIndex = -1;
  let amountIndex = -1;

  for (let i = 0; i < headers.length; i++) {
    const h = cleanHeader(headers[i]);

    if (dateIndex === -1 && (h === 'date' || h === 'txndate' || h === 'transactiondate' || h === 'valuedate')) {
      dateIndex = i;
    } else if (descIndex === -1 && (h.includes('description') || h.includes('narration') || h.includes('remarks') || h.includes('particulars'))) {
      descIndex = i;
    } else if (debitIndex === -1 && (h.includes('withdrawal') || h.includes('debit'))) {
      debitIndex = i;
    } else if (creditIndex === -1 && (h.includes('deposit') || h.includes('credit'))) {
      creditIndex = i;
    } else if (amountIndex === -1 && h === 'amount') {
      amountIndex = i;
    }
  }

  if (dateIndex === -1 || descIndex === -1 || (debitIndex === -1 && amountIndex === -1)) {
    return null;
  }

  return {
    dateIndex,
    descIndex,
    debitIndex: debitIndex !== -1 ? debitIndex : amountIndex,
    creditIndex,
  };
}

// Parses Indian and ISO date formats into YYYY-MM-DD
export function parseDate(raw) {
  if (!raw) return null;
  const str = String(raw).trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD-Mon-YYYY (e.g. 25-Oct-2026)
  const dMonYMatch = str.match(/^(\d{1,2})[/-]([A-Za-z]{3})[/-](\d{4})$/);
  if (dMonYMatch) {
    const [, d, mon, y] = dMonYMatch;
    const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    const m = months[mon.toLowerCase()];
    if (m) {
      return `${y}-${m}-${d.padStart(2, '0')}`;
    }
  }

  return null;
}

// Cleans amount string into numeric float
export function parseAmount(raw) {
  if (!raw) return null;
  const clean = String(raw).replace(/[^0-9.-]/g, '');
  if (!clean) return null;
  const val = parseFloat(clean);
  return Number.isFinite(val) ? val : null;
}

// Previews statement CSV and detects duplicates & categories (#100, #101)
export async function previewStatement(userId, csvContent) {
  if (Buffer.byteLength(csvContent, 'utf8') > MAX_FILE_SIZE) {
    throw new HttpError(400, 'File exceeds maximum allowed size of 1 MB', {
      code: 'FILE_TOO_LARGE',
    });
  }

  const rows = parseCSVLines(csvContent);
  if (rows.length < 2) {
    throw new HttpError(400, 'Unknown or empty statement layout', {
      code: 'UNKNOWN_LAYOUT',
    });
  }

  // Find header row that matches known layout
  let layout = null;
  let headerRowIndex = -1;

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const candidate = detectLayout(rows[i]);
    if (candidate) {
      layout = candidate;
      headerRowIndex = i;
      break;
    }
  }

  if (!layout) {
    throw new HttpError(400, 'Unknown bank statement layout. Ensure columns for Date, Description, and Debit amount are present.', {
      code: 'UNKNOWN_LAYOUT',
    });
  }

  const userCategories = await listCategories(userId);
  const categoriesByName = new Map(userCategories.map((c) => [c.name.toLowerCase(), c]));

  return withUser(userId, async (db) => {
    // Existing user expenses for duplicate matching
    const { rows: existingExpenses } = await db.query(
      `SELECT id, amount::numeric, date::text, lower(merchant) as merchant, lower(note) as note
       FROM expenses
       WHERE user_id = $1`,
      [userId],
    );

    const transactions = [];

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const line = rows[i];
      if (!line || line.length === 0) continue;

      const rawDate = line[layout.dateIndex];
      const rawDesc = line[layout.descIndex];
      const rawDebit = line[layout.debitIndex];
      const rawCredit = layout.creditIndex !== -1 ? line[layout.creditIndex] : null;

      const date = parseDate(rawDate);
      const amount = parseAmount(rawDebit);
      const credit = parseAmount(rawCredit);

      // Skip lines with no amount or credit deposits
      if (!amount || amount <= 0 || (credit && credit > 0 && !amount)) {
        continue;
      }

      if (!date) continue;

      const description = String(rawDesc ?? '').trim();
      const merchantGuess = description.replace(/^(UPI|POS|NEFT|RTGS|IMPS|CARD)[-\s]+/i, '').trim();

      // Category suggestion (#101)
      const suggestedCatName = suggestCategoryName(description) || suggestCategoryName(merchantGuess);
      const matchedCategory = suggestedCatName ? categoriesByName.get(suggestedCatName.toLowerCase()) : null;

      // Duplicate check (#101): match date, amount, and similar description/merchant
      const isDuplicate = existingExpenses.some((exp) => {
        if (exp.date !== date) return false;
        if (Math.abs(Number(exp.amount) - amount) >= 0.005) return false;
        if (!exp.merchant && !exp.note) return true;
        const normExp = `${exp.merchant || ''} ${exp.note || ''}`.toLowerCase();
        const normDesc = description.toLowerCase();
        return normExp.includes(normDesc.slice(0, 10)) || normDesc.includes(normExp.slice(0, 10)) || normExp.length === 0;
      });

      transactions.push({
        date,
        amount: Number(amount.toFixed(2)),
        merchant: merchantGuess.slice(0, 100),
        note: description.slice(0, 255),
        is_duplicate: isDuplicate,
        category_id: matchedCategory?.id ?? null,
        category_name: matchedCategory?.name ?? null,
      });
    }

    return {
      total_found: transactions.length,
      duplicate_count: transactions.filter((t) => t.is_duplicate).length,
      transactions,
    };
  });
}

// Imports selected transactions in one atomic transaction (#102)
export async function importExpenses(userId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, 'No expense items provided for import', { code: 'EMPTY_IMPORT' });
  }

  return withUser(userId, async (db) => {
    const inserted = [];

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const amount = Number(item.amount);

      if (!amount || amount <= 0 || isNaN(amount)) {
        throw new HttpError(400, `Row ${index + 1}: Amount must be a positive number`, {
          code: 'VALIDATION',
          row: index + 1,
        });
      }

      const dateStr = parseDate(item.date);
      if (!dateStr) {
        throw new HttpError(400, `Row ${index + 1}: Invalid date format`, {
          code: 'VALIDATION',
          row: index + 1,
        });
      }

      // Check future date
      if (new Date(`${dateStr}T23:59:59Z`) > new Date()) {
        throw new HttpError(400, `Row ${index + 1}: Expense date cannot be in the future`, {
          code: 'VALIDATION',
          row: index + 1,
        });
      }

      // Check category if provided
      let categoryId = item.category_id ?? null;
      if (categoryId) {
        const catRes = await db.query(
          `SELECT id FROM categories WHERE id = $1 AND (user_id IS NULL OR user_id = $2)`,
          [categoryId, userId],
        );
        if (catRes.rows.length === 0) {
          throw new HttpError(400, `Row ${index + 1}: Invalid category ID`, {
            code: 'INVALID_CATEGORY',
            row: index + 1,
          });
        }
      }

      const { rows } = await db.query(
        `INSERT INTO expenses (user_id, amount, date, merchant, category_id, note)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, amount, date, merchant, category_id, note, created_at`,
        [userId, amount.toFixed(2), dateStr, item.merchant || null, categoryId, item.note || null],
      );

      inserted.push(rows[0]);
    }

    return {
      count: inserted.length,
      expenses: inserted,
    };
  });
}
