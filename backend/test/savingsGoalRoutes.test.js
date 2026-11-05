import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  createUser,
  loginAs,
  useTestDatabase,
} from './helpers.js';

useTestDatabase();

const app = createApp();

describe('Savings goal route edge cases', () => {
  test('rejects invalid goal IDs when updating and deleting', async () => {
    const user = await createUser('invalid_goal_id@test.com');
    const cookie = await loginAs(user);

    // An invalid UUID should return HTTP 400 for update.
    await request(app)
      .put('/api/savings-goals/not-a-uuid')
      .set('Cookie', cookie)
      .send({
        name: 'Emergency Fund',
        target_amount: 10000,
        saved_amount: 1000,
      })
      .expect(400);

    // An invalid UUID should also return HTTP 400 for delete.
    await request(app)
      .delete('/api/savings-goals/not-a-uuid')
      .set('Cookie', cookie)
      .expect(400);
  });

  test('returns 404 when updating or deleting a nonexistent goal', async () => {
    const user = await createUser('missing_goal@test.com');
    const cookie = await loginAs(user);

    const nonexistentGoalId =
      '00000000-0000-4000-8000-000000000001';

    // Updating a goal that does not exist should return HTTP 404.
    await request(app)
      .put(`/api/savings-goals/${nonexistentGoalId}`)
      .set('Cookie', cookie)
      .send({
        name: 'Emergency Fund',
        target_amount: 10000,
        saved_amount: 1000,
      })
      .expect(404);

    // Deleting a goal that does not exist should return HTTP 404.
    await request(app)
      .delete(`/api/savings-goals/${nonexistentGoalId}`)
      .set('Cookie', cookie)
      .expect(404);
  });
});