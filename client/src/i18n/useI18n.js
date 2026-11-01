// The hook every component uses for text in the current language, and for dates and prices.
//
//   const { t, te, lang, setLang, formatDate } = useI18n();
//   t('nav.logout')            -> "Log out" / "تسجيل الخروج"
//   te(error)                  -> an API error as a message in the current language
//   formatDate('2026-11-09')   -> "09 Nov 2026" / "09 تشرين الثاني 2026"
import { useTranslation } from 'react-i18next';

// The locale used for dates and numbers in each language.
// Arabic keeps Western digits (nu-latn): on a stock screen a quantity or price must read the
// same to every pharmacist, as on Jordanian invoices and labels.
// en-GB gives day-month order and a 24-hour clock, as used in Jordan.
const LOCALES = { en: 'en-GB', ar: 'ar-JO-u-nu-latn' };

// Reads '2026-11-09' (or a longer ISO date) as that calendar day, ignoring time zones.
function toCalendarDay(value) {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day));
}

export function useI18n() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const locale = LOCALES[lang];

  // Switch the whole app to 'en' or 'ar'
  function setLang(language) {
    i18n.changeLanguage(language);
  }

  // Turns an error from the API into a message in the current language.
  // The server sends a fixed `code` (e.g. MEDICATION_NOT_FOUND) that has a translation under
  // errors.*; if there is none, the server's English message is shown instead.
  function te(error) {
    if (!error) {
      return null;
    }
    if (typeof error === 'string') {
      return error;
    }
    const params = error.params || {};
    // (the params are passed to exists() too, so a plural message with a `count` is found)
    if (error.code && i18n.exists(`errors.${error.code}`, params)) {
      return t(`errors.${error.code}`, params);
    }
    return error.message || t('errors.INTERNAL');
  }

  // "09 Nov 2026" - used for expiry dates. The month is always a word, never a number:
  // 2026-11-09 and 2026-11-19 differ by one digit in the middle, a month name does not.
  function formatDate(value) {
    if (!value) {
      return '—';
    }
    const date = toCalendarDay(value);
    if (!date) {
      return String(value);
    }
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
  }

  // "21 Sep" - for chart axes.
  function formatDayMonth(value) {
    const date = toCalendarDay(value);
    if (!date) {
      return String(value);
    }
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
  }

  // "Sep 2026" - for the monthly chart. Takes a date or "YYYY-MM".
  function formatMonthYear(value) {
    const text = String(value);
    const date = toCalendarDay(/^\d{4}-\d{2}$/.test(text) ? `${text}-01` : text);
    if (!date) {
      return text;
    }
    return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
  }

  // A chat message time ("2026-10-21 18:40:12.345") in the reader's own time zone.
  function formatDateTime(value) {
    if (!value) {
      return '';
    }
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(date);
  }

  // Prices always have two decimals: 1.5 -> "1.50"
  function formatPrice(value) {
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
  }

  return {
    t,
    te,
    lang,
    locale,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    setLang,
    formatDate,
    formatDayMonth,
    formatMonthYear,
    formatDateTime,
    formatPrice,
  };
}
