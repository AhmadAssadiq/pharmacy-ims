// Checks a phone number the way the server does, so a typo is reported in the user's
// language before the form is sent. The server still makes the final decision.
export function normalisePhone(raw) {
  const compact = String(raw ?? '').trim().replace(/[\s\-().]/g, '').replace(/^00/, '+');
  if (!compact) return { error: 'required' };
  if (!/^\+?\d{8,15}$/.test(compact)) return { error: 'invalid' };
  return { value: compact };
}
