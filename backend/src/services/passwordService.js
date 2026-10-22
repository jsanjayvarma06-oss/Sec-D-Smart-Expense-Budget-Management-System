
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
