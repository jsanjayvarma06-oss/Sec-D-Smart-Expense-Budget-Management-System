
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { suggestCategoryName } from '../src/services/merchantCategoryService.js';

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
});
