import { useI18n } from '../i18n/I18nContext';

/**
 * Switches between English and Arabic. The button names the language it
 * switches to, in that language ("العربية" / "English"), and carries its `lang`
 * so a screen reader pronounces it correctly, the usual convention for a
 * language switch.
 */
export default function LanguageToggle() {
  const { t, setLang } = useI18n();
  const target = t('language.switchToCode');

  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm lang-toggle"
      lang={target}
      title={t('language.title')}
      onClick={() => setLang(target)}
    >
      {t('language.switchTo')}
    </button>
  );
}
