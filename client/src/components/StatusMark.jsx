/**
 * Status marks for stock and expiry (FR 4).
 *
 * Each state carries a distinct glyph AND a word, so the meaning survives
 * colour blindness, a greyscale printout and a low-contrast screen. Colour is
 * the third channel, never the only one.
 */

const GLYPHS = {
  ok: (
    <path d="M3 7.2 5.6 9.8 11 4.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  ),
  low: (
    <path d="M7 2.5v6.2m0 0L4.4 6.1M7 8.7l2.6-2.6M2.6 11.5h8.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  ),
  out: (
    <>
      <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.8 10.2 10.2 3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  clock: (
    <>
      <circle cx="7" cy="7" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 4.2V7l2 1.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  expired: (
    <>
      <path d="M7 2.2 12.6 11.6H1.4Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7 6v2.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7" cy="10.1" r="0.7" fill="currentColor" />
    </>
  ),
};

function Glyph({ name }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      {GLYPHS[name]}
    </svg>
  );
}

/** One badge: glyph + label, in the tone for its severity. */
export default function StatusMark({ kind, label }) {
  const tone =
    kind === 'out' || kind === 'expired' ? 'danger' : kind === 'ok' ? 'success' : 'warning';
  return (
    <span className={`badge badge--${tone}`}>
      <Glyph name={kind} />
      {label}
    </span>
  );
}

/**
 * Every status a medication row can be in, worst first. A row can be in more
 * than one (out of stock AND holding expired lots), so this returns a list.
 */
export function medicationStatuses(med) {
  const marks = [];
  if (med.is_out_of_stock) marks.push({ kind: 'out', label: 'Out of stock' });
  else if (med.is_low_stock) marks.push({ kind: 'low', label: 'Low stock' });

  if (med.expired_quantity > 0) {
    marks.push({ kind: 'expired', label: `${med.expired_quantity} expired` });
  }
  if (!med.is_out_of_stock && med.is_near_expiry && med.days_until_expiry != null) {
    marks.push({ kind: 'clock', label: `Expires in ${med.days_until_expiry} d` });
  }
  if (marks.length === 0) marks.push({ kind: 'ok', label: 'OK' });
  return marks;
}
