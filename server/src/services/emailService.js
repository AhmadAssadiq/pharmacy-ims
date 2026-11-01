// Sends emails (used for password reset links) with the nodemailer library.
// The SMTP settings come from server/.env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM).
// If SMTP_HOST or MAIL_FROM is empty, emails are simply not sent.
import nodemailer from 'nodemailer';
import { config } from '../config.js';

// So the "email is not set up" warning is printed only once, not on every request
let hasWarnedNotConfigured = false;

// True when the SMTP settings needed to send an email are filled in.
export function isEmailConfigured() {
  return Boolean(config.email.host && config.email.from);
}

// Prints a one-time warning that emails are switched off.
export function warnEmailNotConfigured() {
  if (hasWarnedNotConfigured) {
    return;
  }
  hasWarnedNotConfigured = true;
  console.warn('[mail] SMTP is not configured (SMTP_HOST, MAIL_FROM in server/.env); emails are not sent.');
}

// Sends one plain-text email.
export async function sendEmail({ to, subject, text }) {
  const transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure, // true = TLS from the start (port 465)
    requireTLS: config.email.requireTLS, // refuse to send the password without encryption
    auth: config.email.user ? { user: config.email.user, pass: config.email.password } : undefined,
  });

  await transporter.sendMail({ from: config.email.from, to, subject, text });
}
