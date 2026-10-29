import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { base32Decode, base32Encode, currentStep, totpAt, verifyTotp } from '../src/services/totp.js';
import { decryptSecret, encryptSecret } from '../src/services/twoFactorService.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();

describe('TOTP codes (RFC 6238)', () => {
  // The SHA-1 test vectors from RFC 6238 appendix B, last 6 of the 8 digits.
  const rfcSecret = Buffer.from('12345678901234567890');
  for (const [seconds, code] of [[59, '287082'], [1111111109, '081804'], [1234567890, '005924'], [2000000000, '279037']]) {
    test(`matches the RFC test vector at ${seconds}s`, () => {
      assert.equal(totpAt(rfcSecret, Math.floor(seconds / 30)), code);
    });
  }

  test('accepts the code one step either side and nothing further', () => {
    const now = 1_800_000_000_000;
    const step = currentStep(now);
    assert.equal(verifyTotp(rfcSecret, totpAt(rfcSecret, step), now), true);
    assert.equal(verifyTotp(rfcSecret, totpAt(rfcSecret, step - 1), now), true);
    assert.equal(verifyTotp(rfcSecret, totpAt(rfcSecret, step + 1), now), true);
    assert.equal(verifyTotp(rfcSecret, totpAt(rfcSecret, step - 2), now), false);
    assert.equal(verifyTotp(rfcSecret, totpAt(rfcSecret, step + 2), now), false);
  });

  test('rejects anything that is not 6 digits', () => {
    for (const code of ['', '12345', '1234567', 'abcdef', null, 123456]) {
      assert.equal(verifyTotp(rfcSecret, code), false);
    }
  });

  test('base32 round-trips and matches the RFC 4648 example', () => {
    assert.equal(base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
    const secret = crypto.randomBytes(20);
    assert.deepEqual(base32Decode(base32Encode(secret)), secret);
  });
});

describe('Secret encryption', () => {
  test('decrypts what it encrypted, with a fresh IV each time', () => {
    const secret = crypto.randomBytes(20);
    const a = encryptSecret(secret);
    const b = encryptSecret(secret);
    assert.notEqual(a, b);
    assert.deepEqual(decryptSecret(a), secret);
    assert.doesNotMatch(a, new RegExp(base32Encode(secret)));
  });

  test('a tampered value or the wrong key is refused', () => {
    const stored = encryptSecret(crypto.randomBytes(20));
    const parts = stored.split(':');
    parts[3] = Buffer.from('tampered-ciphertext').toString('base64url');
    assert.throws(() => decryptSecret(parts.join(':')));
    assert.throws(() => decryptSecret(stored, crypto.randomBytes(32)));
  });
});

// The secret the server just stored for this user, decrypted, so the test can
// make codes the way an authenticator app would.
async function pendingSecret(userId) {
  const { rows } = await query('SELECT two_factor_pending_secret FROM users WHERE id = $1', [userId]);
  return decryptSecret(rows[0].two_factor_pending_secret);
}

describe('Two-factor setup API (#104)', () => {
  test('requires a session', async () => {
    await request(app).post('/api/auth/two-factor/setup').expect(401);
    await request(app).post('/api/auth/two-factor/confirm').send({ code: '123456' }).expect(401);
  });

  test('setup returns a QR code and a manual key once, and stores the secret encrypted', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const res = await request(app).post('/api/auth/two-factor/setup').set('Cookie', cookie).expect(200);
    assert.match(res.body.qr_code, /^data:image\/png;base64,/);
    assert.match(res.body.manual_key, /^[A-Z2-7]{4}( [A-Z2-7]{1,4})+$/);
    assert.equal(res.headers['cache-control'], 'no-store');

    const { rows } = await query(
      'SELECT two_factor_pending_secret, two_factor_secret, two_factor_enabled_at FROM users WHERE id = $1',
      [user.id],
    );
    const plainKey = res.body.manual_key.replace(/ /g, '');
    assert.doesNotMatch(rows[0].two_factor_pending_secret, new RegExp(plainKey));
    assert.equal(base32Encode(await pendingSecret(user.id)), plainKey);
    assert.equal(rows[0].two_factor_secret, null, 'nothing is on before a code is entered');
    assert.equal(rows[0].two_factor_enabled_at, null);
  });

  test('a wrong code does not turn it on', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    await request(app).post('/api/auth/two-factor/setup').set('Cookie', cookie).expect(200);
    const right = totpAt(await pendingSecret(user.id), currentStep());
    const wrong = right === '000000' ? '111111' : '000000';

    const res = await request(app).post('/api/auth/two-factor/confirm').set('Cookie', cookie)
      .send({ code: wrong }).expect(400);
    assert.equal(res.body.code, 'INVALID_TWO_FACTOR_CODE');

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
    assert.equal(me.body.user.two_factor_enabled, false);
  });

  test('a valid code from the app turns it on', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    await request(app).post('/api/auth/two-factor/setup').set('Cookie', cookie).expect(200);
    const code = totpAt(await pendingSecret(user.id), currentStep());

    const res = await request(app).post('/api/auth/two-factor/confirm').set('Cookie', cookie)
      .send({ code: `${code.slice(0, 3)} ${code.slice(3)}` }).expect(200);
    assert.equal(res.body.user.two_factor_enabled, true);

    const { rows } = await query(
      'SELECT two_factor_pending_secret, two_factor_secret, two_factor_enabled_at FROM users WHERE id = $1',
      [user.id],
    );
    assert.equal(rows[0].two_factor_pending_secret, null);
    assert.ok(rows[0].two_factor_secret.startsWith('v1:'));
    assert.ok(rows[0].two_factor_enabled_at);

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
    assert.equal(me.body.user.two_factor_enabled, true);
  });

  test('once on, setup cannot be started again', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    await request(app).post('/api/auth/two-factor/setup').set('Cookie', cookie).expect(200);
    const code = totpAt(await pendingSecret(user.id), currentStep());
    await request(app).post('/api/auth/two-factor/confirm').set('Cookie', cookie).send({ code }).expect(200);

    const again = await request(app).post('/api/auth/two-factor/setup').set('Cookie', cookie).expect(409);
    assert.equal(again.body.code, 'TWO_FACTOR_ALREADY_ON');
    await request(app).post('/api/auth/two-factor/confirm').set('Cookie', cookie).send({ code }).expect(409);
  });

  test('starting again replaces the secret, so the first QR code stops working', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    await request(app).post('/api/auth/two-factor/setup').set('Cookie', cookie).expect(200);
    const first = await pendingSecret(user.id);
    await request(app).post('/api/auth/two-factor/setup').set('Cookie', cookie).expect(200);
    const second = await pendingSecret(user.id);
    assert.notDeepEqual(first, second);

    const step = currentStep();
    const oldCodes = [step - 1, step, step + 1].map((s) => totpAt(first, s));
    const newCodes = new Set([step - 1, step, step + 1].map((s) => totpAt(second, s)));
    const oldOnly = oldCodes.find((c) => !newCodes.has(c));
    if (oldOnly) {
      await request(app).post('/api/auth/two-factor/confirm').set('Cookie', cookie)
        .send({ code: oldOnly }).expect(400);
    }
  });

  test('confirming without starting setup is refused', async () => {
    const cookie = await loginAs(await createUser());
    const res = await request(app).post('/api/auth/two-factor/confirm').set('Cookie', cookie)
      .send({ code: '123456' }).expect(400);
    assert.equal(res.body.code, 'TWO_FACTOR_NOT_STARTED');
  });

  test('the code must be 6 digits', async () => {
    const cookie = await loginAs(await createUser());
    const res = await request(app).post('/api/auth/two-factor/confirm').set('Cookie', cookie)
      .send({ code: '12ab56' }).expect(400);
    assert.equal(res.body.code, 'VALIDATION');
  });
});
