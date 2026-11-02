// Turns OCR text from a printed receipt into expense fields (story #83, #86).
// Pure function, so it can be thoroughly unit tested without a browser or Tesseract.
//
// Returns { amount, date, merchant, categoryName, rawText, fieldsDetected }.
// The user can check and correct every field on the form before saving.

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  january: '01', february: '02', march: '03', april: '04', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

const CATEGORY_KEYWORDS = {
  Food: [
    'restaurant', 'cafe', 'canteen', 'coffee', 'bakery', 'kitchen', 'food',
    'burger', 'pizza', 'dosa', 'biryani', 'mess', 'swiggy', 'zomato', 'bar',
    'bistro', 'diner', 'grill', 'tea', 'chai', 'supermarket', 'groceries',
    'grocery', 'mart', 'fruits', 'vegetables', 'provisions', 'bread', 'dairy',
    'atta', 'oil', 'salt', 'rice', 'dal', 'milk', 'sugar',
  ],
  Transport: [
    'fuel', 'petrol', 'diesel', 'cng', 'hpcl', 'bpcl', 'iocl', 'uber', 'ola',
    'auto', 'metro', 'toll', 'parking', 'transit', 'railway', 'taxi',
  ],
  Healthcare: [
    'pharmacy', 'chemist', 'medical', 'hospital', 'clinic', 'diagnostics',
    'healthcare', 'medicals', 'apollo', 'medplus', 'tablets', 'rx', 'paracetamol',
  ],
  Shopping: [
    'apparel', 'fashion', 'clothing', 'garments', 'shoes',
    'electronics', 'mall', 'bazaar', 'trends', 'zara', 'h&m', 'myntra',
  ],
  Utilities: [
    'telecom', 'recharge', 'broadband', 'electricity', 'water', 'gas',
  ],
  Entertainment: [
    'cinema', 'theatre', 'multiplex', 'pvr', 'inox', 'entertainment',
  ],
  Education: [
    'books', 'bookstore', 'stationery', 'university', 'college', 'academy',
  ],
};

const HEADER_IGNORE_PATTERNS = [
  /^(tax|retail|cash|proforma)?\s*(invoice|memo|bill|receipt|slip|voucher)$/i,
  /^(original|duplicate|triplicate)(\s+(for\s+)?(recipient|buyer|seller|customer|supplier|copy))?$/i,
  /^(customer|store|merchant|buyer)\s*(copy|slip)$/i,
  /^(welcome(\s*to)?|thank\s*you(\s*for\s*(shopping|visiting))?|have\s*a\s*nice\s*day)/i,
  /^(gstin|gst\s*no|fssai|cin|pan|tin|cst|tan)[\s:.-]*[a-z0-9]+/i,
  /^(tel|phone|ph|mobile|mob|contact|email|web|www|http|https)[\s:.-]/i,
  /^[0-9\s.,/:#*+_-]+$/,
];

function cleanNumber(str) {
  if (!str) return null;
  const cleaned = str.replace(/,/g, '').trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatDate(year, month, day) {
  const y = String(year).padStart(4, '20');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isValidPastOrPresentDate(isoStr) {
  if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return false;
  const parts = isoStr.split('-').map(Number);
  const m = parts[1];
  const d = parts[2];
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const parsed = new Date(isoStr + 'T00:00:00');
  if (isNaN(parsed.getTime())) return false;
  // Compare with current date in local time
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return isoStr <= todayStr && isoStr >= '2000-01-01';
}

export function parseReceiptAmount(lines) {
  // 1. First search for explicit TOTAL lines (TOTAL, GRAND TOTAL, NET PAYABLE, BALANCE DUE, etc.)
  const totalRegexes = [
    /(?:grand\s*total|net\s*payable|net\s*amount|balance\s*due|amount\s*payable|total\s*amount)[\s:₹$Rs]*([0-9,]+\.[0-9]{2})/i,
    /(?:grand\s*total|net\s*payable|net\s*amount|balance\s*due|amount\s*payable|total\s*amount)[\s:₹$Rs]*([0-9,]+)/i,
    /(?:total|sub\s*total|amount|cash|paid|bill\s*amount)[\s:₹$Rs]*([0-9,]+\.[0-9]{2})/i,
    /(?:total|sub\s*total|amount|cash|paid|bill\s*amount)[\s:₹$Rs]*([0-9,]+)/i,
  ];

  for (const regex of totalRegexes) {
    for (const line of lines) {
      const match = line.match(regex);
      if (match) {
        const val = cleanNumber(match[1]);
        if (val) return val;
      }
    }
  }

  // 2. Look for lines with currency symbols (₹, Rs., INR, $)
  const currencyRegex = /(?:₹|rs\.?|inr|\$)\s*([0-9,]+(?:\.[0-9]{2})?)/gi;
  let maxCurrencyVal = 0;
  for (const line of lines) {
    let match;
    while ((match = currencyRegex.exec(line)) !== null) {
      const val = cleanNumber(match[1]);
      if (val && val > maxCurrencyVal) {
        maxCurrencyVal = val;
      }
    }
  }
  if (maxCurrencyVal > 0) return maxCurrencyVal;

  // 3. Fallback: extract all decimal numbers in lines and take the largest reasonable total
  const decimalRegex = /\b([0-9,]+\.[0-9]{2})\b/g;
  let maxDecimalVal = 0;
  for (const line of lines) {
    // skip lines that look like dates or phone numbers
    if (/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(line)) continue;
    let match;
    while ((match = decimalRegex.exec(line)) !== null) {
      const val = cleanNumber(match[1]);
      if (val && val > maxDecimalVal && val < 1000000) {
        maxDecimalVal = val;
      }
    }
  }
  return maxDecimalVal > 0 ? maxDecimalVal : null;
}

export function parseReceiptDate(lines) {
  // Patterns for dates:
  // YYYY-MM-DD or YYYY/MM/DD
  const isoPattern = /\b(20\d{2})[/-](0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])\b/;
  // DD/MM/YYYY or DD-MM-YYYY
  const dmyPattern = /\b(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])[/-](20\d{2}|\d{2})\b/;
  // DD Month YYYY (e.g. 28 Oct 2026 or 28-Oct-2026)
  const monthWordPattern = /\b(0?[1-9]|[12]\d|3[01])[\s/-]+([a-z]{3,9})[\s/-]+(20\d{2}|\d{2})\b/i;

  for (const line of lines) {
    const isoMatch = line.match(isoPattern);
    if (isoMatch) {
      const dateStr = formatDate(isoMatch[1], isoMatch[2], isoMatch[3]);
      if (isValidPastOrPresentDate(dateStr)) return dateStr;
    }

    const wordMatch = line.match(monthWordPattern);
    if (wordMatch) {
      const monthNum = MONTHS[wordMatch[2].toLowerCase()];
      if (monthNum) {
        const year = wordMatch[3].length === 2 ? `20${wordMatch[3]}` : wordMatch[3];
        const dateStr = formatDate(year, monthNum, wordMatch[1]);
        if (isValidPastOrPresentDate(dateStr)) return dateStr;
      }
    }

    const dmyMatch = line.match(dmyPattern);
    if (dmyMatch) {
      const year = dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3];
      const dateStr = formatDate(year, dmyMatch[2], dmyMatch[1]);
      if (isValidPastOrPresentDate(dateStr)) return dateStr;
    }
  }

  return null;
}

export function parseReceiptMerchant(lines) {
  // Find the first line among the top 8 lines that is a valid store/merchant name
  const candidateLines = lines.slice(0, 8);
  for (const rawLine of candidateLines) {
    const trimmed = rawLine.trim();
    if (trimmed.length < 3) continue;

    // Check if line matches an ignore pattern
    const isIgnored = HEADER_IGNORE_PATTERNS.some((pat) => pat.test(trimmed));
    if (isIgnored) continue;

    // Reject lines that are mostly numbers or punctuation
    const alphaCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
    if (alphaCount < 3) continue;

    // Strip leading/trailing non-alphanumeric noise
    const cleaned = trimmed.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9)]+$/g, '').trim();
    if (cleaned.length >= 3) {
      return cleaned;
    }
  }

  return null;
}

export function matchReceiptCategory(text, userCategories = []) {
  // Strip out generic footer greetings like "thank you for shopping with us"
  const cleanedText = text
    .replace(/thank\s*you\s*(for\s*shopping)?/gi, '')
    .toLowerCase();

  const scores = {};

  // Score matches for each category
  const activeCategories = userCategories.length > 0
    ? userCategories.map((c) => (typeof c === 'string' ? c : c.name))
    : Object.keys(CATEGORY_KEYWORDS);

  for (const catName of activeCategories) {
    scores[catName] = 0;
    // Category name directly mentioned
    const catRegex = new RegExp(`\\b${catName.toLowerCase()}\\b`, 'g');
    const directMatches = (cleanedText.match(catRegex) || []).length;
    scores[catName] += directMatches * 3;

    // Keyword matches
    const keywords = CATEGORY_KEYWORDS[catName] || [];
    for (const kw of keywords) {
      const kwRegex = new RegExp(`\\b${kw}\\b`, 'g');
      const matches = (cleanedText.match(kwRegex) || []).length;
      scores[catName] += matches * 2;
    }
  }

  let bestCat = null;
  let maxScore = 0;
  for (const [catName, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestCat = catName;
    }
  }

  return maxScore > 0 ? bestCat : null;
}

export function parseReceiptText(text, userCategories = []) {
  if (!text || typeof text !== 'string') {
    return {
      amount: null,
      date: null,
      merchant: null,
      categoryName: null,
      rawText: '',
      fieldsDetected: { amount: false, date: false, merchant: false, category: false },
    };
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const amount = parseReceiptAmount(lines);
  const date = parseReceiptDate(lines);
  const merchant = parseReceiptMerchant(lines);
  const categoryName = matchReceiptCategory(text, userCategories);

  return {
    amount,
    date,
    merchant,
    categoryName,
    rawText: text,
    fieldsDetected: {
      amount: amount !== null,
      date: date !== null,
      merchant: merchant !== null,
      category: categoryName !== null,
    },
  };
}
