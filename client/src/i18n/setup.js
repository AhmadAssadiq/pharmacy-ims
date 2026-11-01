// Sets up translations (English and Arabic) with the i18next library (GP2 addition).
// Imported once, in main.jsx, before the app starts.
//
// The texts live in en.json and ar.json. In the code, t('nav.logout') returns the text for
// the current language. Placeholders are written {name} and filled in like this:
//   t('phone.callLabel', { phone: '0791234567' })
// Plurals use keys ending in _one, _other (Arabic also has _zero, _two, _few, _many), and
// i18next picks the right one from `count`:   t('common.units', { count: 3 })  ->  "3 units"
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ar from './ar.json';

const STORAGE_KEY = 'pims_lang';
const ARABIC_FONT_ID = 'font-arabic';
const ARABIC_FONT_URL =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap';

// Invisible Unicode marks around every inserted text value. They stop a Latin medication
// name from scrambling the word order of an Arabic sentence, and the other way round.
const ISOLATE_START = '⁨';
const ISOLATE_END = '⁩';

// The language to start in: the one chosen last time, or Arabic if the browser is in Arabic
function chooseStartLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ar') {
      return saved;
    }
  } catch {
    // localStorage can be blocked (private mode): fall back to the browser language
  }
  const browserLanguage = String(navigator.language || '').toLowerCase();
  return browserLanguage.startsWith('ar') ? 'ar' : 'en';
}

// Adds the Arabic font to the page (only once, and only when Arabic is used).
// The main font (Geist) has no Arabic letters.
function loadArabicFont() {
  if (document.getElementById(ARABIC_FONT_ID)) {
    return;
  }
  const link = document.createElement('link');
  link.id = ARABIC_FONT_ID;
  link.rel = 'stylesheet';
  link.href = ARABIC_FONT_URL;
  document.head.appendChild(link);
}

// Updates the page for a language: <html lang dir>, the tab title, the font, and remembers it.
function applyLanguage(language) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.title = i18next.t('app.title');
  if (language === 'ar') {
    loadArabicFont();
  }
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // The choice lasts for this visit only
  }
}

i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: chooseStartLanguage(),
  fallbackLng: 'en', // a text missing in Arabic is shown in English
  interpolation: {
    // Placeholders are written {name} (i18next's default would be {{name}})
    prefix: '{',
    suffix: '}',
    // React already protects against HTML injection, so i18next does not need to
    escapeValue: false,
    // Wrap every inserted text value in the isolation marks (numbers are left as they are)
    alwaysFormat: true,
    format: (value) => (typeof value === 'string' ? `${ISOLATE_START}${value}${ISOLATE_END}` : value),
  },
});

applyLanguage(i18next.language);
i18next.on('languageChanged', applyLanguage);

export default i18next;
