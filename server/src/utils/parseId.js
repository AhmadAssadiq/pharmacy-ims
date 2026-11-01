// Reads a numeric id from the URL (for example the 12 in /api/medications/12).
import createError from 'http-errors';

// Returns the id as a number, or throws a 400 error such as "Invalid medication id"
// when it is not a positive whole number (like /api/medications/abc).
export function parseId(text, label) {
  const id = Number(text);
  if (!Number.isInteger(id) || id <= 0) {
    throw createError(400, `Invalid ${label} id`);
  }
  return id;
}
