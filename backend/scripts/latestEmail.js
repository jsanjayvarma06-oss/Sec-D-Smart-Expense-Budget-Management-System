// Shows the newest email in mail_outbox, for development without SMTP.
//
//   npm run mail:latest -w backend
//
// Use it to open a password reset link locally. Production sets SMTP_URL, so
// nothing is stored there.

import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  const { rows } = await client.query(
    `SELECT to_address, subject, body, created_at FROM mail_outbox ORDER BY created_at DESC LIMIT 1`,
  );
  if (!rows[0]) {
    console.log('No emails yet.');
  } else {
    const mail = rows[0];
    console.log(`To:      ${mail.to_address}\nSubject: ${mail.subject}\nSent:    ${mail.created_at.toISOString()}\n\n${mail.body}`);
  }
} catch (err) {
  console.error(`Could not read the outbox: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
