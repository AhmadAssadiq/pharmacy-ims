// The button that switches between English and Arabic. It is written in the language it
// switches to ("العربية" / "English"), as language buttons usually are.
import { useI18n } from '../i18n/useI18n';

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
