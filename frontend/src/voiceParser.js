// Turns a spoken sentence like "Spent 120 on chai at the canteen" into expense
// fields (story #87). Pure function, so it can be tested without a browser.
//
// Returns { amount, categoryName, merchant, note, daysAgo }. Any field it can't
// find is null; the user always reviews the form before saving.

const SMALL = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES = { hundred: 100, thousand: 1000, lakh: 100000 };

// Words that point to a category, checked against the user's own category names.
const CATEGORY_WORDS = {
  Food: ['chai', 'tea', 'coffee', 'lunch', 'dinner', 'breakfast', 'snack', 'snacks', 'food', 'canteen', 'mess',
    'swiggy', 'zomato', 'pizza', 'biryani', 'groceries', 'grocery', 'restaurant', 'juice', 'dosa', 'samosa'],
  Transport: ['uber', 'ola', 'rapido', 'auto', 'rickshaw', 'bus', 'metro', 'train', 'cab', 'taxi', 'petrol',
    'diesel', 'fuel', 'parking', 'toll'],
  Shopping: ['amazon', 'flipkart', 'myntra', 'clothes', 'shirt', 'shoes', 'shopping', 'meesho', 'ajio'],
  Entertainment: ['movie', 'movies', 'cinema', 'netflix', 'spotify', 'hotstar', 'concert', 'game', 'games', 'pvr'],
  Utilities: ['electricity', 'wifi', 'internet', 'recharge', 'mobile', 'phone', 'water', 'gas', 'bill'],
  Healthcare: ['medicine', 'medicines', 'doctor', 'pharmacy', 'hospital', 'clinic', 'tablets', 'gym'],
  Education: ['book', 'books', 'course', 'fees', 'fee', 'stationery', 'notebook', 'udemy', 'exam', 'tuition'],
  Travel: ['flight', 'hotel', 'trip', 'holiday', 'ticket', 'tickets'],
  Housing: ['rent', 'hostel', 'pg'],
};

const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

function wordsToNumber(words) {
  // "one twenty" (said as 1-20) → 120: a single digit followed by a 10–99 value, no scale word.
  if (words.length === 2 && SMALL[words[0]] >= 1 && SMALL[words[0]] <= 9) {
    const second = SMALL[words[1]] ?? TENS[words[1]];
    if (second !== undefined && second >= 10) return SMALL[words[0]] * 100 + second;
  }
  if (words.length === 3 && SMALL[words[0]] >= 1 && SMALL[words[0]] <= 9 && TENS[words[1]] && SMALL[words[2]] >= 1 && SMALL[words[2]] <= 9) {
    return SMALL[words[0]] * 100 + TENS[words[1]] + SMALL[words[2]];
  }
  let total = 0;
  let current = 0;
  for (const word of words) {
    if (SMALL[word] !== undefined) current += SMALL[word];
    else if (TENS[word] !== undefined) current += TENS[word];
    else if (word === 'hundred') current = (current || 1) * 100;
    else if (SCALES[word]) { total += (current || 1) * SCALES[word]; current = 0; }
  }
  return total + current;
}

export function parseAmount(text) {
  const lower = text.toLowerCase().replace(/,(?=\d{2,3}\b)/g, '');
  const digits = lower.match(/(?:₹|rs\.?|inr|rupees?)?\s*(\d+(?:\.\d{1,2})?)\s*(k\b)?/);
  if (digits) {
    const value = Number(digits[1]) * (digits[2] ? 1000 : 1);
    return value > 0 ? Math.round(value * 100) / 100 : null;
  }
  const numberWord = new RegExp(`^(${[...Object.keys(SMALL), ...Object.keys(TENS), ...Object.keys(SCALES), 'and'].join('|')})$`);
  const tokens = lower.split(/[^a-z]+/).filter(Boolean);
  let best = [];
  let run = [];
  for (const token of [...tokens, '']) {
    if (numberWord.test(token) && !(token === 'and' && run.length === 0)) run.push(token);
    else {
      const trimmed = run.filter((w) => w !== 'and');
      if (trimmed.length > best.length) best = trimmed;
      run = [];
    }
  }
  const value = best.length ? wordsToNumber(best) : 0;
  return value > 0 ? value : null;
}

export function parseCategory(text, categoryNames = Object.keys(CATEGORY_WORDS)) {
  const words = text.toLowerCase().split(/[^a-z]+/);
  const available = new Map(categoryNames.map((name) => [name.toLowerCase(), name]));
  // A category named outright ("for food", "transport") wins.
  for (const word of words) if (available.has(word)) return available.get(word);
  for (const [category, keywords] of Object.entries(CATEGORY_WORDS)) {
    if (available.has(category.toLowerCase()) && words.some((w) => keywords.includes(w))) {
      return available.get(category.toLowerCase());
    }
  }
  return null;
}

const STOP = /\s+(?:for|on|today|yesterday|this|last|and|with|by|using)\b.*$/;

export function parseMerchant(text) {
  const match = text.match(/\b(?:at|from)\s+(?:the\s+)?([a-z0-9][a-z0-9 &'.-]*)/i);
  if (!match) return null;
  const merchant = match[1].replace(STOP, '').replace(/[.,!?]+$/, '').trim();
  return merchant ? titleCase(merchant) : null;
}

export function parseNote(text) {
  const match = text.match(/\b(?:on|for)\s+(?:a\s+|an\s+|some\s+|the\s+)?([a-z][a-z ]*?)(?=\s+(?:at|from|today|yesterday)\b|[.,!?]|$)/i);
  if (!match) return null;
  const note = match[1].trim();
  if (!note || /^(rupees?|rs|inr)$/i.test(note)) return null;
  return note;
}

export function parseSpokenExpense(text, categoryNames) {
  const clean = String(text ?? '').trim();
  if (!clean) return { amount: null, categoryName: null, merchant: null, note: null, daysAgo: 0 };
  return {
    amount: parseAmount(clean),
    categoryName: parseCategory(clean, categoryNames),
    merchant: parseMerchant(clean),
    note: parseNote(clean),
    daysAgo: /\byesterday\b/i.test(clean) ? 1 : 0,
  };
}
