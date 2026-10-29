// Makes an existing account an administrator (story #109).
//
//   npm run admin:create -w backend -- someone@example.com
//
// The account must already be registered: an unknown email is refused, and
// nothing in the app itself can make someone an admin.

import { pool } from '../src/db/pool.js';
import { promoteToAdmin } from '../src/services/adminService.js';

const email = process.argv[2];

try {
  if (!email || !email.includes('@')) {
    console.error('Usage: npm run admin:create -w backend -- <email of a registered account>');
    process.exitCode = 1;
  } else {
    const admin = await promoteToAdmin(email);
    if (admin) {
      console.log(`${admin.email} is now an admin. They will see the Admin panel next time they log in.`);
    } else {
      console.error('No account uses that email. Register it in the app first, then run this again.');
      process.exitCode = 1;
    }
  }
} catch (err) {
  console.error(`Could not update the account: ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
