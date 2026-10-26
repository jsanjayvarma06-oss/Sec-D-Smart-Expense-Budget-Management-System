// Sends email through SMTP when SMTP_URL is set. Otherwise the message is kept in
// the mail_outbox table, where `npm run mail:latest -w backend` shows it, so
// password resets can be used in development without an email account.
// Messages are never written to the log, since reset links grant access (SR10).

import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

let transport;
let warned = false;

export async function sendMail({ to, subject, text }) {
  if (config.mail.smtpUrl) {
    transport ??= nodemailer.createTransport(config.mail.smtpUrl);
    await transport.sendMail({ from: config.mail.from, to, subject, text });
    return;
  }

  if (config.isProduction && !warned) {
    warned = true;
    logger.warn('SMTP_URL is not set; emails are stored in mail_outbox instead of being sent');
  }
  await query(
    `INSERT INTO mail_outbox (to_address, subject, body) VALUES ($1, $2, $3)`,
    [to, subject, text],
  );
}
