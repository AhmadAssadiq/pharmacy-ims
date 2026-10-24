/**
 * Outgoing email (GP2 addition), over utils/smtp.js with the SMTP_* settings
 * in server/.env. When SMTP_HOST or MAIL_FROM is missing, mail is not sent:
 * isConfigured() is false and callers decide what to do instead.
 */
const env = require('../config/env');
const smtp = require('../utils/smtp');

let warned = false;

function isConfigured() {
  return Boolean(env.smtp.host && env.mailFrom);
}

/** Logs once that mail is off, so a missing setting is visible but not noisy. */
function warnNotConfigured() {
  if (warned) return;
  warned = true;
  console.warn('[mail] SMTP is not configured (SMTP_HOST, MAIL_FROM in server/.env); emails are not sent.');
}

async function sendMail({ to, subject, text }) {
  const message = smtp.buildMessage({ from: env.mailFrom, to, subject, text });
  const envelope = { from: smtp.parseAddress(env.mailFrom).address, to: smtp.parseAddress(to).address };
  await smtp.send(env.smtp, envelope, message);
}

module.exports = { isConfigured, warnNotConfigured, sendMail };
