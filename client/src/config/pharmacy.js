/**
 * Everything specific to the pharmacy itself, in one place (GP2 addition).
 * The About and Contact pages read only from here.
 *
 * EVERY VALUE BELOW IS A PLACEHOLDER. Nothing about a real business has been
 * filled in. Replace each one with the pharmacy's actual details before the
 * site is shown to anyone. Text that differs by language has an `en` and an
 * `ar` value; numbers, the email and the map query are shared.
 */
export const PHARMACY = {
  // The pharmacy's trading name.
  name: { en: '[Pharmacy name]', ar: '[اسم الصيدلية]' },

  // Street address as a patient would write it on an envelope.
  address: {
    en: '[Building number, street], [area], [city], Jordan',
    ar: '[رقم المبنى، الشارع]، [المنطقة]، [المدينة]، الأردن',
  },

  // What "Open in Maps" searches for: the address, or the pharmacy's name and
  // city. A plain link to a maps search - no embedded map, no third-party script.
  mapsQuery: '[Pharmacy name], [city], Jordan',

  // Shown as written; `phoneDial` is what the tel: link dials (digits and +).
  phone: '+962 [x xxx xxxx]',
  phoneDial: '+9620000000000',

  email: 'pharmacy@example.com',

  // The pharmacy's licence number from the Jordan Food and Drug
  // Administration, if it is to be shown. Set to null to hide the line.
  licenceNumber: '[licence number]',

  // One row per group of days. Use null for `hours` on a day the pharmacy is closed.
  openingHours: [
    { days: { en: '[Saturday – Thursday]', ar: '[السبت – الخميس]' }, hours: '[09:00 – 22:00]' },
    { days: { en: '[Friday]', ar: '[الجمعة]' }, hours: '[hours, or null if closed]' },
  ],
};

/** The value for the active language, falling back to English. */
export function localized(value, lang) {
  if (value && typeof value === 'object') return value[lang] ?? value.en;
  return value;
}

export function mapsUrl() {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(PHARMACY.mapsQuery)}`;
}
