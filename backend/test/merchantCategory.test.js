
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SUGGESTED_CATEGORY_NAMES, suggestCategoryName } from '../src/services/merchantCategoryService.js';

describe('Merchant category suggestions', () => {
  test('suggests Food for Swiggy and Zomato', () => {
    assert.equal(suggestCategoryName('Swiggy order'), 'Food');
    assert.equal(suggestCategoryName('ZOMATO'), 'Food');
  });

  test('suggests Transport for Uber and petrol', () => {
    assert.equal(suggestCategoryName('Uber ride'), 'Transport');
    assert.equal(suggestCategoryName('Petrol pump'), 'Transport');
  });

  test('suggests Shopping for Amazon and Flipkart', () => {
    assert.equal(suggestCategoryName('Amazon'), 'Shopping');
    assert.equal(suggestCategoryName('Flipkart order'), 'Shopping');
  });

  test('suggests Entertainment for Netflix and Spotify', () => {
    assert.equal(suggestCategoryName('Netflix subscription'), 'Entertainment');
    assert.equal(suggestCategoryName('Spotify'), 'Entertainment');
  });

  test('suggests Healthcare for a pharmacy', () => {
    assert.equal(suggestCategoryName('Apollo Pharmacy'), 'Healthcare');
  });

  test('suggests Utilities for an electricity bill', () => {
    assert.equal(suggestCategoryName('Electricity bill'), 'Utilities');
  });

  test('returns null for an unknown or empty merchant', () => {
    assert.equal(suggestCategoryName('Unknown Store'), null);
    assert.equal(suggestCategoryName(''), null);
    assert.equal(suggestCategoryName(null), null);
  });

  test('matches whole words only, so look-alikes are not suggested', () => {
    assert.equal(suggestCategoryName('Ola cabs'), 'Transport');
    assert.equal(suggestCategoryName('Coca-Cola stall'), null);
    assert.equal(suggestCategoryName('City bus pass'), 'Transport');
    assert.equal(suggestCategoryName('Business centre'), null);
    assert.equal(suggestCategoryName('Cafeteria'), null);
    assert.equal(suggestCategoryName('Pizza'), 'Food');
  });

  test('matches a keyword next to punctuation, digits and extra spaces', () => {
    assert.equal(suggestCategoryName('  SWIGGY*ORDER 1234 '), 'Food');
    assert.equal(suggestCategoryName('netflix.com'), 'Entertainment');
    assert.equal(suggestCategoryName('Apollo   Pharmacy'), 'Healthcare');
    assert.equal(suggestCategoryName('Apollo Pharmacy, Belagavi'), 'Healthcare');
  });

  test('Uber Eats is food, a plain Uber is transport', () => {
    assert.equal(suggestCategoryName('Uber Eats'), 'Food');
    assert.equal(suggestCategoryName('Uber trip'), 'Transport');
  });

  test('lists the category names the rules point at', () => {
    assert.deepEqual(
      [...SUGGESTED_CATEGORY_NAMES].sort(),
      ['Entertainment', 'Food', 'Healthcare', 'Shopping', 'Transport', 'Utilities'],
    );
  });
});
