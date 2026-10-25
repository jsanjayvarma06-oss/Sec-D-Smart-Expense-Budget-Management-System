
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  hashPassword,
  verifyPassword,
} from '../src/services/passwordService.js';

describe('password service', () => {
  test('hashes a password instead of storing plaintext', async () => {
    const password = 'StrongPass123!';
    const passwordHash = await hashPassword(password);

    assert.notEqual(passwordHash, password);
    assert.match(passwordHash, /^\$2[aby]\$/);
  });

  test('verifies the correct password', async () => {
    const password = 'StrongPass123!';
    const passwordHash = await hashPassword(password);

    assert.equal(await verifyPassword(password, passwordHash), true);
  });

  test('rejects an incorrect password', async () => {
    const passwordHash = await hashPassword('StrongPass123!');

    assert.equal(await verifyPassword('WrongPass123!', passwordHash), false);
  });

  test('rejects passwords shorter than 8 characters', async () => {
    await assert.rejects(
      hashPassword('short'),
      /Password must be at least 8 characters/,
    );
  });

  test('rejects passwords longer than bcrypt’s 72-byte limit', async () => {
    await assert.rejects(
      hashPassword('a'.repeat(73)),
      /72 bytes/,
    );
  });

  test('returns false for invalid verification inputs', async () => {
    assert.equal(await verifyPassword(null, 'invalid-hash'), false);
    assert.equal(await verifyPassword('password', null), false);
    assert.equal(await verifyPassword('password', 'invalid-hash'), false);
  });
});
