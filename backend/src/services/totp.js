// Time-based one-time passwords (RFC 6238), the 6-digit codes that Google
// Authenticator and similar apps show. Built on node:crypto so no third-party
// code ever sees a secret.

import crypto from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEP_SECONDS = 30;
export const DIGITS = 6;

export function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += BASE32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}

export function base32Decode(text) {
  let bits = '';
  for (const char of text.replace(/[\s=]/g, '').toUpperCase()) {
    const value = BASE32.indexOf(char);
    if (value === -1) throw new TypeError('Invalid base32 secret');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

// The code for one 30-second step (HOTP over the step number, RFC 4226).
export function totpAt(secret, step, digits = DIGITS) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function currentStep(now = Date.now()) {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

// True when the code matches the current step or the one either side of it,
// which allows for a phone clock up to 30 seconds out.
export function verifyTotp(secret, code, now = Date.now()) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  const step = currentStep(now);
  let matched = false;
  for (const candidate of [step - 1, step, step + 1]) {
    // Compare every candidate in constant time so timing gives nothing away.
    matched = crypto.timingSafeEqual(Buffer.from(totpAt(secret, candidate)), Buffer.from(code)) || matched;
  }
  return matched;
}

// The link an authenticator app reads from the QR code.
export function otpauthUrl({ issuer, account, secret }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: base32Encode(secret),
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params}`;
}
