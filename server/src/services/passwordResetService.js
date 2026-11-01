// "Forgot password" and "reset password" (GP2 addition).
//
// How it works:
// 1. The user types their email. If an account exists, we create a random secret token,
//    save only its SHA-256 hash in the password_resets table, and email them a link
//    containing the token. The link works once and expires after 15 minutes.
// 2. The link opens the reset page. When they choose a new password, we hash the token
//    from the link, find the matching row, and if it is still valid we change the password.
// 3. Changing the password also records the time (users.password_changed_at), so every
//    login token made before that moment stops working (see middleware/auth.js).
//
// The answer to step 1 is always the same, whether or not the email has an account,
// so nobody can use this form to find out who is registered.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import createError from 'http-errors';
import { db, runInTransaction } from '../db.js';
import { config } from '../config.js';
import { ERROR_CODES, PASSWORD_RESET_MINUTES } from '../constants.js';
import { resetPasswordSchema } from '../validation/authSchemas.js';
import { validate } from '../validation/validate.js';
import { BCRYPT_ROUNDS, findUserByEmail, findUserById } from './authService.js';
import { clearFailedLogins } from './loginLockout.js';
import { isEmailConfigured, warnEmailNotConfigured, sendEmail } from './emailService.js';

// SHA-256 hash of a token, written as 64 hex characters. Only this is stored in the database,
// so someone who copies the table still cannot use it to reset a password.
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

// The reset email, in English or Arabic. Plain text so it looks the same in every mail app.
export function buildResetEmail(language, { name, link, minutes }) {
  if (language === 'ar') {
    return {
      subject: 'إعادة تعيين كلمة المرور - Pharmacy IMS',
      text: [
        `مرحبًا ${name}،`,
        '',
        'طلب أحدهم إعادة تعيين كلمة المرور لحسابك. لاختيار كلمة مرور جديدة، افتح هذا الرابط:',
        '',
        link,
        '',
        `يعمل الرابط مرة واحدة وتنتهي صلاحيته خلال ${minutes} دقيقة.`,
        'إذا لم تطلب ذلك، فتجاهل هذه الرسالة؛ لن تتغير كلمة المرور.',
      ].join('\n'),
    };
  }
  return {
    subject: 'Reset your Pharmacy IMS password',
    text: [
      `Hello ${name},`,
      '',
      'Someone asked to reset the password for your account. To choose a new one, open this link:',
      '',
      link,
      '',
      `The link works once and expires in ${minutes} minutes.`,
      'If this was not you, ignore this email; your password stays the same.',
    ].join('\n'),
  };
}

// Creates a reset token for `email` and emails the link, if the account exists.
async function createAndSendResetLink(email, language) {
  const user = await findUserByEmail(email);
  if (!user) {
    return; // no account: do nothing, but the caller still gives the same answer
  }

  // A random token: 32 random bytes written as 64 hex characters
  const token = crypto.randomBytes(32).toString('hex');

  await runInTransaction(async (connection) => {
    // Retire any older unused link, so only the newest one works
    await connection.query(
      'UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
      [user.id]
    );
    // Save the hash of the new token, valid for 15 minutes (the time is worked out by MySQL)
    await connection.query(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
      [user.id, hashToken(token), PASSWORD_RESET_MINUTES]
    );
  });

  const link = `${config.clientOrigin}/reset-password?token=${token}`;

  // For development: print the link to the server console (never in production)
  if (config.authResetDebug && config.nodeEnv !== 'production') {
    console.log(`[password reset] link for ${email} (valid ${PASSWORD_RESET_MINUTES} min): ${link}`);
  }

  if (!isEmailConfigured()) {
    warnEmailNotConfigured();
    return;
  }
  const resetEmail = buildResetEmail(language, { name: user.name, link, minutes: PASSWORD_RESET_MINUTES });
  await sendEmail({ to: email, subject: resetEmail.subject, text: resetEmail.text });
}

// Step 1: "forgot password". `input` is already validated: { email, lang }.
export function requestPasswordReset(input) {
  // Not awaited on purpose: if we waited, an existing account would answer more slowly than
  // an unknown one, which would give away which emails are registered.
  createAndSendResetLink(input.email, input.lang).catch((error) => {
    console.error('Password reset email could not be sent:', error.message);
  });

  return { message: 'If an account exists for that email, a reset link has been sent.' };
}

// The error for a link that is wrong, already used or expired
function invalidLinkError() {
  return createError(400, 'This reset link is invalid or has expired', { code: ERROR_CODES.RESET_TOKEN_INVALID });
}

// Step 2: "reset password". `body` is { token, password } from the reset page.
// Returns the id of the user whose password changed (so their open chat can be closed too).
export async function resetPassword(body) {
  // A badly formed token is always reported as an invalid link
  const tokenCheck = resetPasswordSchema.shape.token.safeParse(body?.token);
  if (!tokenCheck.success) {
    throw invalidLinkError();
  }
  const input = validate(resetPasswordSchema, body);

  const userId = await runInTransaction(async (connection) => {
    // Find the token's row and lock it, so the same link cannot be used twice at once
    const [rows] = await connection.query(
      `SELECT id, user_id, used_at, UNIX_TIMESTAMP(expires_at) * 1000 AS expires_ms
       FROM password_resets WHERE token_hash = ? FOR UPDATE`,
      [hashToken(input.token)]
    );
    const resetRow = rows[0];

    // The link must exist, be unused and not be expired
    const isValid = resetRow && !resetRow.used_at && Number(resetRow.expires_ms) > Date.now();
    if (!isValid) {
      throw invalidLinkError();
    }

    // Save the new password and the time it changed (this signs out every old session)
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    await connection.query('UPDATE users SET password_hash = ?, password_changed_at = NOW() WHERE id = ?', [
      passwordHash,
      resetRow.user_id,
    ]);

    // Mark this link (and any other unused link of this user) as used
    await connection.query(
      'UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
      [resetRow.user_id]
    );
    return resetRow.user_id;
  });

  // A successful reset also unlocks the account
  const user = await findUserById(userId);
  if (user) {
    clearFailedLogins(user.email);
  }
  return userId;
}
