
const MERCHANT_CATEGORY_RULES = [
  {
    keywords: ['swiggy', 'zomato', 'restaurant', 'cafe', 'dominos', 'pizza'],
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

export function suggestCategoryName(merchant) {
  if (typeof merchant !== 'string' || !merchant.trim()) {
    return null;
  }

  const normalizedMerchant = merchant.trim().toLowerCase();

  const match = MERCHANT_CATEGORY_RULES.find((rule) =>
    rule.keywords.some((keyword) => normalizedMerchant.includes(keyword)),
  );

  return match?.category ?? null;
}
