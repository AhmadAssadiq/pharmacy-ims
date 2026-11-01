// Helpers for checking request data with the zod library.
//
// A "schema" describes what valid data looks like, for example:
//   const loginSchema = z.object({ email: emailField, password: passwordField });
// validate(loginSchema, req.body) then either returns the cleaned-up data,
// or stops the request with a 400 "Validation failed" error listing what is wrong
// with each field, e.g. { email: 'Email is required' }. The React forms show
// those messages next to the matching input.
//
// The field builders below are reused by the schema files in this folder, so every
// form gets the same rules and the same English messages.
import { z } from 'zod';
import createError from 'http-errors';
import { ERROR_CODES } from '../constants.js';

// Turns a zod error into { fieldName: 'first problem with that field' }.
export function firstErrorPerField(zodError) {
  const errors = {};
  for (const issue of zodError.issues) {
    const field = issue.path[0];
    // Keep only the first message for each field (e.g. "is required" before "is too long")
    if (errors[field] === undefined) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

// Checks `input` against `schema`.
// Returns the cleaned data (trimmed text, numbers instead of number-strings...),
// or throws a 400 error with code VALIDATION_FAILED and the field messages as `details`.
export function validate(schema, input) {
  // A request with no body at all is treated like an empty form
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw createError(400, 'Validation failed', {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: firstErrorPerField(result.error),
    });
  }
  return result.data;
}

// ----------------------------------------------------------------------------
// Field builders
// ----------------------------------------------------------------------------

// Converts what a form sends into text without spaces around it ('  Panadol ' -> 'Panadol').
function toTrimmedText(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

// Converts what a form sends into a number. Empty values become undefined (meaning "missing").
// '12' -> 12, ' 7 ' -> 7, 'abc' -> NaN (not a number), '' -> undefined
function toNumberOrMissing(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return Number(String(value).trim());
}

// A text field that must be filled in, with a maximum length.
// Example: requiredText('Name', 150) gives "Name is required" / "Name must be at most 150 characters".
export function requiredText(label, maxLength) {
  return z.preprocess(
    toTrimmedText,
    z
      .string()
      .min(1, `${label} is required`)
      .max(maxLength, `${label} must be at most ${maxLength} characters`)
  );
}

// A text field that may be left empty. Empty becomes null (stored as NULL in MySQL).
export function optionalText(label, maxLength) {
  return z.preprocess(
    toTrimmedText,
    z
      .string()
      .max(maxLength, `${label} must be at most ${maxLength} characters`)
      .transform((text) => (text === '' ? null : text))
  );
}

// A whole-number field (a quantity, an id...).
// messages: { required, notWhole, tooSmall, tooBig } - the text shown for each problem.
// min / max: the smallest and largest allowed values (max is optional).
export function wholeNumber({ min, max, messages }) {
  let schema = z
    .number({
      // undefined means the field was left empty; anything else means it was not a number
      error: (issue) => (issue.input === undefined ? messages.required : messages.notWhole),
    })
    .int(messages.notWhole)
    .min(min, messages.tooSmall);

  if (max !== undefined) {
    schema = schema.max(max, messages.tooBig);
  }
  return z.preprocess(toNumberOrMissing, schema);
}

// A whole number that may be left empty; when empty, `defaultValue` is used instead.
export function optionalWholeNumber({ min, defaultValue, messages }) {
  const schema = z
    .number({ error: messages.notWhole })
    .int(messages.notWhole)
    .min(min, messages.tooSmall)
    .optional()
    .transform((number) => (number === undefined ? defaultValue : number));
  return z.preprocess(toNumberOrMissing, schema);
}

// A price: must be filled in, a number, not negative. It is rounded to 2 decimals (2.505 -> 2.51).
export function priceField(label) {
  const schema = z
    .number({
      error: (issue) => (issue.input === undefined ? `${label} is required` : `${label} must be a number`),
    })
    .min(0, `${label} cannot be negative`)
    .transform((price) => Math.round(price * 100) / 100);
  return z.preprocess(toNumberOrMissing, schema);
}

// True when `text` is a real calendar date written as YYYY-MM-DD (so '2026-02-30' is false).
export function isRealDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

// A date field that must be filled in, written as YYYY-MM-DD.
export function requiredDate(label) {
  return z.preprocess(
    toTrimmedText,
    z
      .string()
      .min(1, `${label} is required`)
      .refine(isRealDate, `${label} must be a valid date (YYYY-MM-DD)`)
  );
}
