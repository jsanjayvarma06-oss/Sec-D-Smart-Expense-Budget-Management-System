
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export async function hashPassword(password) {
  if (
    typeof password !== 'string' ||
    password.length < 8 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw new Error('Password must be at least 8 characters and no more than 72 bytes.');
  }

  return bcrypt.hash(password, SALT_ROUNDS);
}

// Checked against when the email is unknown, so a missing account takes as long
// to reject as a wrong password and response times do not reveal which it was.
let dummyHash;

export async function verifyAgainstDummyHash(password) {
  dummyHash ??= await bcrypt.hash('not-a-real-password-placeholder', SALT_ROUNDS);
  await verifyPassword(password, dummyHash);
  return false;
}

export async function verifyPassword(password, passwordHash) {
  if (typeof password !== 'string' || typeof passwordHash !== 'string') {
    return false;
  }

  try {
    return await bcrypt.compare(password, passwordHash);
  } catch {
    return false;
  }
}
