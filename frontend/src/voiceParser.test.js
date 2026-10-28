// Voice entry parser (#89). Run with `npm test -w frontend`.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseAmount, parseSpokenExpense } from './voiceParser.js';

const CATEGORIES = ['Education', 'Entertainment', 'Food', 'Healthcare', 'Housing', 'Other', 'Shopping',
  'Transport', 'Travel', 'Utilities', 'Hostel Mess'];
const parse = (text) => parseSpokenExpense(text, CATEGORIES);

describe('voice entry: whole sentences', () => {
  const cases = [
    ['Spent 120 on chai at the canteen', { amount: 120, categoryName: 'Food', merchant: 'Canteen', note: 'chai', daysAgo: 0 }],
    ['spent one twenty on chai at the canteen', { amount: 120, categoryName: 'Food', merchant: 'Canteen', note: 'chai' }],
    ['250 rupees for an uber to college', { amount: 250, categoryName: 'Transport', merchant: null, note: 'uber to college' }],
    ['Paid ₹499 for Netflix', { amount: 499, categoryName: 'Entertainment', note: 'Netflix' }],
    ['rupees 80 auto yesterday', { amount: 80, categoryName: 'Transport', daysAgo: 1 }],
    ['two thousand five hundred for rent', { amount: 2500, categoryName: 'Housing', note: 'rent' }],
    ['spent 1,250 on groceries at D-Mart', { amount: 1250, categoryName: 'Food', merchant: 'D-Mart', note: 'groceries' }],
    ['1.5k on shoes from Myntra', { amount: 1500, categoryName: 'Shopping', merchant: 'Myntra', note: 'shoes' }],
    ['fifty rupees samosa', { amount: 50, categoryName: 'Food' }],
    ['three hundred and forty on medicines at Apollo Pharmacy', { amount: 340, categoryName: 'Healthcare', merchant: 'Apollo Pharmacy', note: 'medicines' }],
    ['spent 199 on mobile recharge yesterday', { amount: 199, categoryName: 'Utilities', note: 'mobile recharge', daysAgo: 1 }],
    ['spent 300 for food at the mess', { amount: 300, categoryName: 'Food', merchant: 'Mess' }],
  ];
  for (const [sentence, expected] of cases) {
    test(`"${sentence}"`, () => {
      const result = parse(sentence);
      for (const [key, value] of Object.entries(expected)) assert.equal(result[key], value, `${key} for "${sentence}"`);
    });
  }
});

describe('voice entry: amounts', () => {
  for (const [text, amount] of [['ninety nine', 99], ['one hundred', 100], ['a hundred and five', 105],
    ['twelve', 12], ['Rs. 45.50', 45.5], ['two lakh', 200000], ['seven fifty', 750]]) {
    test(`"${text}" → ${amount}`, () => assert.equal(parseAmount(text), amount));
  }
  test('no amount gives null', () => assert.equal(parseAmount('coffee at the canteen'), null));
});

describe('voice entry: what it leaves for the user', () => {
  test('a category the user does not have is not guessed', () => {
    assert.equal(parseSpokenExpense('spent 100 on chai', ['Transport']).categoryName, null);
  });
  test('an empty sentence fills nothing', () => {
    assert.deepEqual(parse(''), { amount: null, categoryName: null, merchant: null, note: null, daysAgo: 0 });
  });
});
