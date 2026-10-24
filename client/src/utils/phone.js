/**
 * Mirrors normalisePhone in server/src/validation/authValidation.js, so a
 * mistyped number is caught in the user's language before the request is
 * sent. The server stays the authority.
 *
 * Returns { value } or { error: 'required' | 'invalid' }.
 */
export function normalisePhone(raw) {
  const compact = String(raw ?? '').trim().replace(/[\s\-().]/g, '').replace(/^00/, '+');
  if (!compact) return { error: 'required' };
  if (!/^\+?\d{8,15}$/.test(compact)) return { error: 'invalid' };
  return { value: compact };
}
