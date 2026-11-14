// The interaction check for a basket of medications (GP2 addition).
// Used on the staff Dispense page and in the patient's order.
//
//   <InteractionNotice medicationIds={[3, 16]} />
//
// With fewer than two medications it shows nothing. With two or more it asks the server
// and shows either the problems found (worst first) or a green "no known interactions".
// It only warns: nothing is ever blocked, the pharmacist decides.
import { useEffect, useState } from 'react';
import { checkInteractions } from '../api/interactions';
import { useI18n } from '../i18n/useI18n';

export default function InteractionNotice({ medicationIds }) {
  const { t, lang } = useI18n();
  // null until the server has answered; then { checked, interactions }
  const [result, setResult] = useState(null);
  const [failed, setFailed] = useState(false);

  // The ids as one piece of text ("3,16"), so the check re-runs only when the basket's
  // medications change, not on every redraw of the page
  const idsText = [...medicationIds].sort((a, b) => a - b).join(',');

  useEffect(() => {
    setResult(null);
    setFailed(false);
    if (medicationIds.length < 2) {
      return undefined;
    }

    // If the basket changes while we wait, ignore the old answer
    let isLatest = true;
    checkInteractions(medicationIds)
      .then((data) => {
        if (isLatest) setResult(data);
      })
      .catch(() => {
        if (isLatest) setFailed(true);
      });
    return () => {
      isLatest = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsText]);

  if (medicationIds.length < 2) {
    return null;
  }
  if (failed) {
    return <div className="alert alert--warning" role="status">{t('interactions.checkFailed')}</div>;
  }
  if (!result) {
    return <p className="muted" role="status">{t('interactions.checking')}</p>;
  }

  // Nothing found: say so clearly, and say what the check covers
  if (result.interactions.length === 0) {
    return (
      <div className="alert alert--success interactions" role="status">
        <strong>{t('interactions.none', { count: result.checked })}</strong>
        <span className="interactions__note">{t('interactions.listNote')}</span>
      </div>
    );
  }

  // The explanation of one problem, in the page's language
  function describe(interaction) {
    if (interaction.type === 'same_ingredient') {
      return t('interactions.sameIngredient', { ingredient: interaction.ingredient });
    }
    return lang === 'ar' ? interaction.description_ar : interaction.description_en;
  }

  return (
    <div className="alert alert--warning interactions" role="alert">
      <strong>{t('interactions.found', { count: result.interactions.length })}</strong>
      <ul className="interactions__list">
        {result.interactions.map((interaction) => (
          <li key={interaction.medication_ids.join('-')}>
            <span className={`badge badge--${interaction.severity === 'minor' ? 'warning' : 'danger'}`}>
              {t(`interactions.severity.${interaction.severity}`)}
            </span>{' '}
            <strong>
              <bdi>{interaction.medication_names[0]}</bdi> + <bdi>{interaction.medication_names[1]}</bdi>
            </strong>
            <br />
            {describe(interaction)}
          </li>
        ))}
      </ul>
      <span className="interactions__note">{t('interactions.decideNote')}</span>
    </div>
  );
}
