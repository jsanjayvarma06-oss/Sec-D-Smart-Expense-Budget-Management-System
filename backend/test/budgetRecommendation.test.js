
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createUser, loginAs, monthsAgo, useTestDatabase } from './helpers.js';

useTestDatabase();
const app = createApp();

describe('Budget recommendation API', () => {
  test('requires authentication', async () => {
    await request(app)
      .get('/api/budgets/recommendations')
      .expect(401);
  });


  test('averages income across the three complete months and does not pad unused budget', async () => {
    const user = await createUser('budget-average@test.com');
    const cookie = await loginAs(user);
    const { body: categoryBody } = await request(app).get('/api/categories').set('Cookie', cookie).expect(200);
    const food = categoryBody.categories.find((category) => category.name === 'Food');
    assert.ok(food);

    for (let month = 1; month <= 3; month += 1) {
      const date = monthsAgo(month, 10);
      await request(app).post('/api/income').set('Cookie', cookie)
        .send({ amount: 15000, source: 'Salary', received_on: date }).expect(201);
      await request(app).post('/api/expenses').set('Cookie', cookie)
        .send({ amount: 2000, category_id: food.id, spent_on: date }).expect(201);
    }

    const { body } = await request(app).get('/api/budgets/recommendations').set('Cookie', cookie).expect(200);
    const recommendation = body.recommendations;

    assert.equal(recommendation.available, true);
    assert.equal(recommendation.total_monthly_income, 15000);
    assert.equal(recommendation.budget_limit, 13500);
    assert.equal(recommendation.total_recommended_budget, 2000);
    assert.equal(recommendation.categories[0].recommended_monthly_budget, 2000);
  });

  test('scales category recommendations to the monthly income cap without exceeding it', async () => {
    const user = await createUser('budget-cap@test.com');
    const cookie = await loginAs(user);
    const { body: categoryBody } = await request(app).get('/api/categories').set('Cookie', cookie).expect(200);
    const food = categoryBody.categories.find((category) => category.name === 'Food');
    const transport = categoryBody.categories.find((category) => category.name === 'Transport');
    assert.ok(food && transport);

    for (let month = 1; month <= 3; month += 1) {
      const date = monthsAgo(month, 10);
      await request(app).post('/api/income').set('Cookie', cookie)
        .send({ amount: 15000, source: 'Salary', received_on: date }).expect(201);
      await request(app).post('/api/expenses').set('Cookie', cookie)
        .send({ amount: 12000, category_id: food.id, spent_on: date }).expect(201);
      await request(app).post('/api/expenses').set('Cookie', cookie)
        .send({ amount: 8000, category_id: transport.id, spent_on: date }).expect(201);
    }

    const { body } = await request(app).get('/api/budgets/recommendations').set('Cookie', cookie).expect(200);
    const recommendation = body.recommendations;

    assert.equal(recommendation.total_monthly_income, 15000);
    assert.equal(recommendation.budget_limit, 13500);
    assert.ok(recommendation.total_recommended_budget <= recommendation.budget_limit);
    assert.equal(recommendation.total_recommended_budget, 13500);
    assert.equal(
      Math.round(recommendation.categories.reduce((sum, item) => sum + item.recommended_monthly_budget, 0) * 100),
      1350000,
    );
  });

  test('returns a valid response for a logged-in user', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const response = await request(app)
      .get('/api/budgets/recommendations')
      .set('Cookie', cookie)
      .expect(200);

    assert.ok(response.body.recommendations);
    assert.equal(
      typeof response.body.recommendations.available,
      'boolean',
    );
    assert.ok(
      Array.isArray(response.body.recommendations.categories),
    );
  });
});
