import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();
const app = createApp();

describe('Ask questions about my money (#96, #97)', () => {
  async function seedUserData(user) {
    // Categories: Food, Travel
    const foodCat = (await query(
      `SELECT id FROM categories WHERE user_id IS NULL AND lower(name) = 'food' LIMIT 1`,
    )).rows[0]?.id;
    const travelCat = (await query(
      `SELECT id FROM categories WHERE user_id IS NULL AND lower(name) = 'travel' LIMIT 1`,
    )).rows[0]?.id;

    // Insert expenses:
    // This month (2026-11-01)
    await query(
      `INSERT INTO expenses (user_id, category_id, amount, merchant, note, spent_on)
       VALUES ($1, $2, 500, 'Cafeteria', 'Lunch with friends', '2026-11-01'),
              ($1, $2, 1200, 'Supermarket', 'Monthly groceries', '2026-11-01'),
              ($1, $3, 800, 'Metro Rail', 'Monthly transit pass', '2026-11-01')`,
      [user.id, foodCat, travelCat],
    );

    // Last month (2026-10-15)
    await query(
      `INSERT INTO expenses (user_id, category_id, amount, merchant, note, spent_on)
       VALUES ($1, $2, 2000, 'Big Restaurant', 'Family dinner', '2026-10-15'),
              ($1, $3, 1500, 'Flight Booking', 'Holiday trip', '2026-10-20')`,
      [user.id, foodCat, travelCat],
    );

    // Income: This month and last month
    await query(
      `INSERT INTO income (user_id, amount, source, received_on)
       VALUES ($1, 25000, 'Software Internship', '2026-11-01'),
              ($1, 20000, 'Internship Stipend', '2026-10-01')`,
      [user.id],
    );

    // Budget: This month
    await query(
      `INSERT INTO budgets (user_id, category_id, amount, month)
       VALUES ($1, NULL, 10000, '2026-11-01')`,
      [user.id],
    );

    return { foodCat, travelCat };
  }

  test('requires authentication', async () => {
    await request(app)
      .post('/api/insights/ask')
      .send({ question: 'How much did I spend this month?' })
      .expect(401);
  });

  test('validates input length and rejects empty or overly long questions', async () => {
    const user = await createUser('ask_val@test.com');
    const cookie = await loginAs(user);

    // Empty
    await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: '   ' })
      .expect(400);

    // Missing
    await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({})
      .expect(400);

    // Over 200 characters
    await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'a'.repeat(201) })
      .expect(400);
  });

  test('Q1: How much did I spend this month?', async () => {
    const user = await createUser('q1@test.com');
    await seedUserData(user);
    const cookie = await loginAs(user);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'How much did I spend this month?' })
      .expect(200);

    assert.equal(res.body.intent, 'period_spending');
    assert.equal(res.body.figures.total_spent, 2500);
    assert.match(res.body.answer, /2,500/);
  });

  test('Q2: How much did I spend on Food this month?', async () => {
    const user = await createUser('q2@test.com');
    await seedUserData(user);
    const cookie = await loginAs(user);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'How much did I spend on Food this month?' })
      .expect(200);

    assert.equal(res.body.intent, 'category_spending');
    assert.equal(res.body.figures.total_spent, 1700); // 500 + 1200
    assert.match(res.body.answer, /1,700/);
    assert.match(res.body.answer, /Food/);
  });

  test('Q3: How much did I spend on food last month?', async () => {
    const user = await createUser('q3@test.com');
    await seedUserData(user);
    const cookie = await loginAs(user);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'How much did I spend on food last month?' })
      .expect(200);

    assert.equal(res.body.intent, 'category_spending');
    assert.equal(res.body.figures.total_spent, 2000);
    assert.match(res.body.answer, /2,000/);
  });

  test('Q4: How much on Travel this month?', async () => {
    const user = await createUser('q4@test.com');
    await seedUserData(user);
    const cookie = await loginAs(user);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'How much on Travel this month?' })
      .expect(200);

    assert.equal(res.body.intent, 'category_spending');
    assert.equal(res.body.figures.total_spent, 800);
    assert.match(res.body.answer, /800/);
  });

  test('Q5: What did I spend in October 2026?', async () => {
    const user = await createUser('q5@test.com');
    await seedUserData(user);
    const cookie = await loginAs(user);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'What did I spend in October 2026?' })
      .expect(200);

    assert.equal(res.body.intent, 'period_spending');
    assert.equal(res.body.figures.total_spent, 3500); // 2000 + 1500
    assert.match(res.body.answer, /3,500/);
  });

  test('Q6: How much did I spend this week?', async () => {
    const user = await createUser('q6@test.com');
    await seedUserData(user);
    const cookie = await loginAs(user);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'How much did I spend this week?' })
      .expect(200);

    assert.equal(res.body.intent, 'period_spending');
    assert.ok(res.body.figures.total_spent >= 0);
  });

  test('Q7: How much did I spend last week?', async () => {
    const user = await createUser('q7@test.com');
    await seedUserData(user);
    const cookie = await loginAs(user);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'How much did I spend last week?' })
      .expect(200);

    assert.equal(res.body.intent, 'period_spending');
    assert.ok(typeof res.body.figures.total_spent === 'number');
  });

  test('Q8: What was my biggest expense this month?', async () => {
    const user = await createUser('q8@test.com');
    await seedUserData(user);
    const cookie = await loginAs(user);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'What was my biggest expense this month?' })
      .expect(200);

    assert.equal(res.body.intent, 'biggest_expense');
    assert.equal(res.body.figures.amount, 1200);
    assert.match(res.body.answer, /Supermarket/);
    assert.match(res.body.answer, /1,200/);
  });

  test('Q9: What was my largest purchase last month?', async () => {
    const user = await createUser('q9@test.com');
    await seedUserData(user);
    const cookie = await loginAs(user);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'What was my largest purchase last month?' })
      .expect(200);

    assert.equal(res.body.intent, 'biggest_expense');
    assert.equal(res.body.figures.amount, 2000);
    assert.match(res.body.answer, /Big Restaurant/);
    assert.match(res.body.answer, /2,000/);
  });

  test('Q10: Biggest expense in Food this month', async () => {
    const user = await createUser('q10@test.com');
    await seedUserData(user);
    const cookie = await loginAs(user);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'What was my biggest expense in Food this month?' })
      .expect(200);

    assert.equal(res.body.intent, 'biggest_expense');
    assert.equal(res.body.figures.amount, 1200);
    assert.equal(res.body.figures.category, 'Food');
  });

  test('Q11: Did I spend more than last month?', async () => {
    const user = await createUser('q11@test.com');
    await seedUserData(user);
    const cookie = await loginAs(user);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'Did I spend more than last month?' })
      .expect(200);

    assert.equal(res.body.intent, 'month_comparison');
    assert.equal(res.body.figures.current_spent, 2500);
    assert.equal(res.body.figures.previous_spent, 3500);
    assert.equal(res.body.figures.difference, -1000);
    assert.match(res.body.answer, /spent less/i);
  });

  test('Q12: Am I spending more or less than last month?', async () => {
    const user = await createUser('q12@test.com');
    await seedUserData(user);
    const cookie = await loginAs(user);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'Am I spending more or less than last month?' })
      .expect(200);

    assert.equal(res.body.intent, 'month_comparison');
    assert.match(res.body.answer, /2,500/);
    assert.match(res.body.answer, /3,500/);
  });

  test('Q13: How much budget do I have left?', async () => {
    const user = await createUser('q13@test.com');
    await seedUserData(user);
    const cookie = await loginAs(user);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'How much budget do I have left?' })
      .expect(200);

    assert.equal(res.body.intent, 'remaining_budget');
    assert.equal(res.body.figures.budgeted_amount, 10000);
    assert.equal(res.body.figures.spent_amount, 2500);
    assert.equal(res.body.figures.remaining_amount, 7500);
    assert.match(res.body.answer, /7,500/);
  });

  test('Q14: What is my remaining budget for this month?', async () => {
    const user = await createUser('q14@test.com');
    await seedUserData(user);
    const cookie = await loginAs(user);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'What is my remaining budget for this month?' })
      .expect(200);

    assert.equal(res.body.intent, 'remaining_budget');
    assert.equal(res.body.figures.remaining_amount, 7500);
  });

  test('Q15: How much did I earn this month?', async () => {
    const user = await createUser('q15@test.com');
    await seedUserData(user);
    const cookie = await loginAs(user);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'How much did I earn this month?' })
      .expect(200);

    assert.equal(res.body.intent, 'income');
    assert.equal(res.body.figures.total_income, 25000);
    assert.match(res.body.answer, /25,000/);
  });

  test('Q16: What was my income last month?', async () => {
    const user = await createUser('q16@test.com');
    await seedUserData(user);
    const cookie = await loginAs(user);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'What was my income last month?' })
      .expect(200);

    assert.equal(res.body.intent, 'income');
    assert.equal(res.body.figures.total_income, 20000);
    assert.match(res.body.answer, /20,000/);
  });

  test('Q17: Total salary this month', async () => {
    const user = await createUser('q17@test.com');
    await seedUserData(user);
    const cookie = await loginAs(user);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'Total salary received this month' })
      .expect(200);

    assert.equal(res.body.intent, 'income');
    assert.equal(res.body.figures.total_income, 25000);
  });

  test('Q18: Unsupported query returns helpful guidance and example questions', async () => {
    const user = await createUser('q18@test.com');
    const cookie = await loginAs(user);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie)
      .send({ question: 'What is the weather outside today?' })
      .expect(200);

    assert.equal(res.body.intent, 'unsupported');
    assert.match(res.body.answer, /I didn't quite understand/);
    assert.ok(Array.isArray(res.body.suggested_questions));
    assert.ok(res.body.suggested_questions.length >= 5);
  });

  test('GET /api/insights/ask/suggestions returns example questions', async () => {
    const user = await createUser('sugg@test.com');
    const cookie = await loginAs(user);

    const res = await request(app)
      .get('/api/insights/ask/suggestions')
      .set('Cookie', cookie)
      .expect(200);

    assert.ok(Array.isArray(res.body.suggestions));
    assert.ok(res.body.suggestions.length >= 5);
  });

  test('strictly isolates data between users', async () => {
    const user1 = await createUser('iso1@test.com');
    const user2 = await createUser('iso2@test.com');

    await seedUserData(user1);
    // user2 has no expenses or income
    const cookie2 = await loginAs(user2);

    const res = await request(app)
      .post('/api/insights/ask')
      .set('Cookie', cookie2)
      .send({ question: 'How much did I spend this month?' })
      .expect(200);

    assert.equal(res.body.figures.total_spent, 0);
    assert.match(res.body.answer, /no expenses recorded/i);
  });
});
