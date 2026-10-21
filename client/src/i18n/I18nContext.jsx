import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from './en.json';
import ar from './ar.json';
import {
  DIRECTIONS,
  LANGUAGES,
  LOCALES,
  createTranslator,
  formatDate,
  formatDateTime,
  formatDayMonth,
  formatPrice,
} from './translate';

const STORAGE_KEY = 'pims_lang';
const DICTIONARIES = { en, ar };

// Geist has no Arabic glyphs, so Arabic text falls through the font stack to
// IBM Plex Sans Arabic. It is only fetched once Arabic is chosen; the inline
// script in index.html adds the same <link> early when Arabic is stored.
const ARABIC_FONT_ID = 'font-arabic';
const ARABIC_FONT_HREF =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap';

function initialLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.includes(stored)) return stored;
  } catch {
    // Storage unavailable: fall through to the browser language.
  }
  return String(navigator.language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

function loadArabicFont() {
  if (document.getElementById(ARABIC_FONT_ID)) return;
  const link = document.createElement('link');
  link.id = ARABIC_FONT_ID;
  link.rel = 'stylesheet';
  link.href = ARABIC_FONT_HREF;
  document.head.appendChild(link);
}

/** Gives interpolated React elements stable keys so they render as one string. */
function keyed(result) {
  return Array.isArray(result) ? result.map((part, i) => <Fragment key={i}>{part}</Fragment>) : result;
}

const I18nContext = createContext(null);

/**
 * Language, direction and locale formatting for the whole app (GP2 addition).
 *
 * `t(key, values)` returns a string, or keyed fragments when a value is a React
 * element. `te(error)` turns an ApiError into the user's language from its
 * stable `code`, falling back to the server's English message.
 */
export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLanguage);
  const locale = LOCALES[lang];
  const dir = DIRECTIONS[lang];

  const translate = useMemo(() => createTranslator(DICTIONARIES[lang], locale, en), [lang, locale]);
  const t = useCallback((key, values) => keyed(translate(key, values)), [translate]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = dir;
    if (lang === 'ar') loadArabicFont();
    document.title = translate('app.title');
  }, [lang, dir, translate]);

  const setLang = useCallback((next) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice lasts for this page only.
    }
    setLangState(next);
  }, []);

  const te = useCallback(
    (error) => {
      if (!error) return null;
      if (typeof error === 'string') return error;
      if (error.code) {
        const key = `errors.${error.code}`;
        const message = translate(key, error.params || {});
        if (message !== key) return message;
      }
      return error.message || translate('errors.INTERNAL');
    },
    [translate]
  );

  const value = useMemo(
    () => ({
      lang,
      dir,
      locale,
      setLang,
      t,
      te,
      formatDate: (v) => formatDate(v, locale),
      formatDayMonth: (v) => formatDayMonth(v, locale),
      formatDateTime: (v) => formatDateTime(v, locale),
      formatPrice: (v) => formatPrice(v, locale),
    }),
    [lang, dir, locale, setLang, t, te]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
