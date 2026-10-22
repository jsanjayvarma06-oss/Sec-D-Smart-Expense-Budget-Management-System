import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redact } from '../src/utils/logger.js';

test('SR10 redacts credentials and amounts from log fields', () => {
  const result = redact({
    userId: 'abc',
    password: 'Test@1234',
    nested: { token: 'secret-token', amount: 450, category: 'Food' },
    items: [{ passwordHash: '$2b$12$x' }],
  });

  assert.deepEqual(result, {
    userId: 'abc',
    password: '[REDACTED]',
    nested: { token: '[REDACTED]', amount: '[REDACTED]', category: 'Food' },
    items: [{ passwordHash: '[REDACTED]' }],
  });
});
