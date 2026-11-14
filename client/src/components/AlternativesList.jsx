// What is in stock instead of an out-of-stock medication (GP2 addition).
// Used on the patient's medication list and on the staff Dispense page.
//
// alternatives: [{ id, name, reason }] from the server, where reason is
//   'same_ingredient' - the same active ingredient in another strength or brand
//   'same_category'   - a different medicine used for the same thing (ask the pharmacist first)
// onChoose(alternative): optional. When given, each alternative is a button (the Dispense
//   page uses it to select that medication); otherwise the names are plain text.
import { useI18n } from '../i18n/useI18n';

export default function AlternativesList({ alternatives, onChoose }) {
  const { t } = useI18n();

  // Nothing suitable is in stock
  if (!alternatives || alternatives.length === 0) {
    return <span className="alternatives muted">{t('alternatives.none')}</span>;
  }

  return (
    <span className="alternatives">
      <span className="alternatives__title">{t('alternatives.title')}</span>
      <ul className="alternatives__list">
        {alternatives.map((alternative) => (
          <li key={alternative.id}>
            {onChoose ? (
              <button type="button" className="btn btn--sm" onClick={() => onChoose(alternative)}>
                <bdi>{alternative.name}</bdi>
              </button>
            ) : (
              <strong><bdi>{alternative.name}</bdi></strong>
            )}{' '}
            <span className="muted">({t(`alternatives.${alternative.reason}`)})</span>
          </li>
        ))}
      </ul>
    </span>
  );
}
