
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { registerSchema, loginSchema } from '../src/services/authSchemas.js';

describe('server-side input validation and sanitization', () => {
  test('rejects a name that is too short', () => {
    const result = registerSchema.safeParse({
      name: 'A',
      email: 'user@example.com',
      password: 'StrongPass123',
    });

    assert.equal(result.success, false);
  });

  test('trims whitespace from names and normalizes email to lowercase', () => {
    const result = registerSchema.safeParse({
      name: '  Dinesh Jadage  ',
      email: '  DINESH@example.com  ',
      password: 'StrongPass123',
    });

    assert.equal(result.success, true);
    assert.equal(result.data.name, 'Dinesh Jadage');
    assert.equal(result.data.email, 'dinesh@example.com');
  });

  test('rejects an invalid email address', () => {
    const result = registerSchema.safeParse({
      name: 'Dinesh',
      email: 'not-an-email',
      password: 'StrongPass123',
    });

    assert.equal(result.success, false);
  });

  test('rejects a password shorter than eight characters', () => {
    const result = registerSchema.safeParse({
      name: 'Dinesh',
      email: 'dinesh@example.com',
      password: 'short',
    });

    assert.equal(result.success, false);
  });

  test('rejects a password exceeding bcrypt’s 72-byte limit', () => {
    const result = registerSchema.safeParse({
      name: 'Dinesh',
      email: 'dinesh@example.com',
      password: 'a'.repeat(73),
    });

    assert.equal(result.success, false);
  });

  test('trims and normalizes email during login validation', () => {
    const result = loginSchema.safeParse({
      email: '  DINESH@example.com ',
      password: 'StrongPass123',
    });

    assert.equal(result.success, true);
    assert.equal(result.data.email, 'dinesh@example.com');
  });

  test('rejects login when the password is missing', () => {
    const result = loginSchema.safeParse({
      email: 'dinesh@example.com',
      password: '',
    });

    assert.equal(result.success, false);
  });
});
