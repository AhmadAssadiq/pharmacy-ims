// The card payment pop-up of a patient's order - a DEMO (GP2 addition).
// No card number is asked for and no real card is charged. It only shows what paying by
// card would look like:
//   stage 'processing' - "Processing payment..." with a spinner (nothing can be clicked)
//   stage 'success'    - "Payment successful" and a Done button
// The page decides the stage (see OrderCart.jsx); null means the pop-up is closed.
import { useI18n } from '../../i18n/useI18n';

export default function PaymentDialog({ stage, amount, onDone }) {
  const { t, formatPrice } = useI18n();

  if (!stage) {
    return null;
  }

  return (
    <div className="modal-scrim">
      <div className="modal payment" role="dialog" aria-modal="true" aria-labelledby="payment-title">
        {stage === 'processing' ? (
          <>
            <span className="payment__spinner" aria-hidden="true" />
            <h2 id="payment-title" role="status">{t('payment.processing')}</h2>
            <p className="modal__lead">{t('payment.demoNote')}</p>
          </>
        ) : (
          <>
            {/* A tick in a circle */}
            <svg className="payment__tick" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
              <circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
              <path d="M13 22.5l6 6 12-13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h2 id="payment-title" role="status">{t('payment.success')}</h2>
            <p className="modal__lead">
              {t('payment.paid', { total: formatPrice(amount) })} {t('payment.demoNote')}
            </p>
            <div className="modal__actions">
              <button type="button" className="btn btn--commit" onClick={onDone} autoFocus>
                {t('payment.done')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
