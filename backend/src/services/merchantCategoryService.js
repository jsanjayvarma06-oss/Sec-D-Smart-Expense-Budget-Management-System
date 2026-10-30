
const MERCHANT_CATEGORY_RULES = [
  {
    keywords: ['swiggy', 'zomato', 'uber eats', 'restaurant', 'cafe', 'dominos', 'pizza'],
    category: 'Food',
  },
  {
    keywords: ['uber', 'ola', 'rapido', 'petrol', 'fuel', 'metro', 'bus'],
    category: 'Transport',
  },
  {
    keywords: ['amazon', 'flipkart', 'myntra', 'shopping'],
    category: 'Shopping',
  },
  {
    keywords: ['netflix', 'spotify', 'cinema', 'movie', 'steam'],
    category: 'Entertainment',
  },
  {
    keywords: ['apollo pharmacy', 'pharmacy', 'hospital', 'clinic'],
    category: 'Healthcare',
  },
  {
    keywords: ['electricity', 'water bill', 'internet', 'broadband'],
    category: 'Utilities',
  },
];

// The category names the rules above point at. Renaming or removing a built-in
// category with one of these names turns that suggestion off.
export const SUGGESTED_CATEGORY_NAMES = [
  ...new Set(MERCHANT_CATEGORY_RULES.map((rule) => rule.category)),
];

// A keyword must be a whole word, so "ola" matches "Ola cabs" but not
// "Coca-Cola", and "bus" matches "City bus" but not "Business centre".
function containsWord(text, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text);
}

export function suggestCategoryName(merchant) {
  if (typeof merchant !== 'string' || !merchant.trim()) {
    return null;
  }

  const normalizedMerchant = merchant.trim().toLowerCase();

  const match = MERCHANT_CATEGORY_RULES.find((rule) =>
    rule.keywords.some((keyword) => containsWord(normalizedMerchant, keyword)),
  );

  return match?.category ?? null;
}
