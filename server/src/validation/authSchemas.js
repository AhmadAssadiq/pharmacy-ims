// What valid data looks like for the account forms: register, login, forgot/reset password,
// change phone number and delete account (FR 1). See validate.js for how these are used.
import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '../constants.js';

// A simple email check: something@something.something
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Emails are compared in lower case without spaces, so ' Sara@Mail.com ' and 'sara@mail.com' match.
export function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase();
}

// Passwords are used exactly as typed (no trimming). Anything that is not text counts as empty.
function passwordAsText(value) {
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

// Phone numbers as people type them: spaces, dashes, dots and brackets are removed and a
// leading 00 becomes +. So '079 123 4567' -> '0791234567' and '00962...' -> '+962...'.
export function normalisePhone(value) {
  return String(value ?? '')
    .trim()
    .replace(/[\s\-().]/g, '')
    .replace(/^00/, '+');
}

// Email on the login form: only needs to be filled in.
const loginEmailField = z.preprocess(normaliseEmail, z.string().min(1, 'Email is required'));

// Email on the register and forgot-password forms: filled in and well formed.
const emailField = z.preprocess(
  normaliseEmail,
  z.string().min(1, 'Email is required').regex(EMAIL_PATTERN, 'Email address is not valid')
);

// A password that must be filled in (login, delete account).
const passwordField = z.preprocess(passwordAsText, z.string().min(1, 'Password is required'));

// A new password: filled in and at least 8 characters (register, reset password).
const newPasswordField = z.preprocess(
  passwordAsText,
  z
    .string()
    .min(1, 'Password is required')
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
);

// A phone number: 8 to 15 digits, optionally starting with +.
// Both 079 123 4567 and +962 79 123 4567 are accepted.
const phoneField = z.preprocess(
  normalisePhone,
  z
    .string()
    .min(1, 'Phone number is required')
    .regex(/^\+?\d{8,15}$/, 'Phone number is not valid')
);

// Register: registration always creates a patient, and every patient needs a phone number.
export const registerSchema = z.object({
  name: z.preprocess(
    (value) => String(value || '').trim(),
    z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters')
  ),
  email: emailField,
  password: newPasswordField,
  phone: phoneField,
});

export const loginSchema = z.object({
  email: loginEmailField,
  password: passwordField,
});

// Adding or changing your own phone number
export const phoneSchema = z.object({
  phone: phoneField,
});

// Deleting your own account: the current password, typed again
export const deleteAccountSchema = z.object({
  password: passwordField,
});

// Forgot password: the email, and the language to write the email in ('ar' or else 'en')
export const forgotPasswordSchema = z.object({
  email: emailField,
  lang: z.any().transform((value) => (value === 'ar' ? 'ar' : 'en')),
});

// Reset password: the 64-character token from the email link and the new password
export const resetPasswordSchema = z.object({
  token: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''),
    z.string().regex(/^[0-9a-f]{64}$/, 'Reset link is not valid')
  ),
  password: newPasswordField,
});
