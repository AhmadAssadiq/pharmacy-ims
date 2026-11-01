// The patient's "Is it in stock?" page (FR 7, FR 2.2). Patients only see in stock / out of
// stock - never quantities, prices or suppliers.
// An out-of-stock medication can be requested as a preorder (GP2 addition); the patient's own
// requests and their status are listed at the top, where a pending one can be cancelled.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAvailability } from '../../api/availability';
import { cancelMyPreorder, createPreorder, fetchMyPreorders } from '../../api/preorders';
import ConfirmDialog from '../../components/ConfirmDialog';
import { PreorderStatus } from '../../components/StatusMark';
import StyledText from '../../components/StyledText';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/useI18n';
import constants from '../../../../shared/constants.json';

const { PREORDER_MAX_QUANTITY, PREORDER_NOTE_MAX_LENGTH, PREORDER_STATUS } = constants;

export default function PatientAvailabilityPage() {
  const { t, te, formatDate } = useI18n();
  const { user } = useAuth();
  const [medications, setMedications] = useState([]);
  const [preorders, setPreorders] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  // The medication being requested (its dialog is open), or null
  const [requesting, setRequesting] = useState(null);
  const [requestForm, setRequestForm] = useState({ quantity: '1', note: '' });
  const [requestError, setRequestError] = useState(null);
  // The request being cancelled (its dialog is open), or null
  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(false);

  // Loads (or reloads) the patient's own requests
  async function loadPreorders() {
    const data = await fetchMyPreorders();
    setPreorders(data.preorders);
  }

  // On load: the availability list and the patient's requests
  useEffect(() => {
    async function loadPage() {
      try {
        const data = await fetchAvailability();
        setMedications(data.medications);
        await loadPreorders();
      } catch (loadError) {
        setError(loadError);
      } finally {
        setLoading(false);
      }
    }
    loadPage();
  }, []);

  // The medications matching the search box (name or category)
  const search = searchText.trim().toLowerCase();
  const visibleMedications = medications.filter((medication) => {
    if (!search) {
      return true;
    }
    return medication.name.toLowerCase().includes(search) || medication.category.toLowerCase().includes(search);
  });

  // True when the patient already has a pending or ready request for this medication
  function hasOpenRequest(medicationId) {
    return preorders.some(
      (preorder) =>
        preorder.medication_id === medicationId &&
        (preorder.status === PREORDER_STATUS.PENDING || preorder.status === PREORDER_STATUS.READY)
    );
  }

  // Shows a green message for 6 seconds
  function showNotice(message) {
    setNotice(message);
    setTimeout(() => setNotice(null), 6000);
  }

  // Opens the "request this medication" dialog
  function startRequest(medication) {
    setRequesting(medication);
    setRequestForm({ quantity: '1', note: '' });
    setRequestError(null);
  }

  async function sendRequest() {
    // Check the quantity first (1 to 100), so the message is in the patient's language
    const quantity = Number(requestForm.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > PREORDER_MAX_QUANTITY) {
      setRequestError(t('preorders.quantityInvalid', { count: PREORDER_MAX_QUANTITY }));
      return;
    }

    setBusy(true);
    setRequestError(null);
    try {
      await createPreorder({ medication_id: requesting.id, quantity: requestForm.quantity, note: requestForm.note });
      await loadPreorders();
      showNotice(t('preorders.requestSent', { name: requesting.name }));
      setRequesting(null);
    } catch (sendError) {
      // Show the first field message if there is one, otherwise the general error
      const fieldMessages = sendError.details ? Object.values(sendError.details) : [];
      setRequestError(fieldMessages.length > 0 ? fieldMessages[0] : te(sendError));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel() {
    setBusy(true);
    try {
      await cancelMyPreorder(cancelling.id);
      await loadPreorders();
      showNotice(t('preorders.requestCancelled', { name: cancelling.medication_name }));
    } catch (cancelError) {
      setError(cancelError);
    } finally {
      setBusy(false);
      setCancelling(null);
    }
  }

  // What to show next to an out-of-stock medication
  function requestAction(medication) {
    if (hasOpenRequest(medication.id)) {
      return <span className="muted" style={{ fontSize: 'var(--fs-small)' }}>{t('preorders.alreadyRequested')}</span>;
    }
    // The pharmacy phones when it arrives, so a request needs a phone number first
    if (!user.phone) {
      return (
        <Link to="/patient/account#phone" style={{ fontSize: 'var(--fs-small)' }}>
          {t('phone.neededToRequest')}
        </Link>
      );
    }
    return (
      <button
        type="button"
        className="btn btn--sm"
        onClick={() => startRequest(medication)}
        aria-label={t('preorders.requestLabel', { name: medication.name })}
      >
        {t('preorders.request')}
      </button>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>{t('availability.title')}</h1>
      </div>

      {notice && <div className="alert alert--success" role="status">{notice}</div>}
      {error && <div className="alert alert--error" role="alert">{te(error)}</div>}

      {/* The patient's own requests */}
      {preorders.length > 0 && (
        <section className="card" aria-labelledby="my-requests-heading">
          <div className="card__header">
            <h2 id="my-requests-heading">{t('preorders.mineTitle')}</h2>
            <span className="card__note">{t('preorders.mineNote')}</span>
          </div>
          <ul className="list">
            {preorders.map((preorder) => (
              <li key={preorder.id} className="list__item">
                <span>
                  <strong><bdi>{preorder.medication_name}</bdi></strong>
                  <br />
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    <StyledText id="preorders.mineLine" values={{ quantity: preorder.quantity, date: formatDate(preorder.created_at) }} />
                  </span>
                </span>
                <span className="list__actions">
                  <PreorderStatus status={preorder.status} t={t} />
                  {preorder.status === PREORDER_STATUS.PENDING && (
                    <button type="button" className="btn btn--sm btn--ghost" onClick={() => setCancelling(preorder)}>
                      {t('preorders.cancelRequest')}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The availability list with its search box */}
      <div className="card">
        <label className="field">
          <span className="field__label">{t('availability.find')}</span>
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={t('availability.placeholder')}
          />
        </label>

        {loading && <p className="muted">{t('common.loading')}</p>}
        {!loading && visibleMedications.length === 0 && <p className="empty">{t('availability.none')}</p>}

        <ul className="list">
          {visibleMedications.map((medication) => (
            <li key={medication.id} className="list__item">
              <span>
                <strong><bdi>{medication.name}</bdi></strong>
                <br />
                <span className="muted" style={{ fontSize: '0.85rem' }}><bdi>{medication.category}</bdi></span>
              </span>
              <span className="list__actions">
                <span className={`badge ${medication.in_stock ? 'badge--success' : 'badge--danger'}`}>
                  {medication.in_stock ? t('availability.inStock') : t('availability.outOfStock')}
                </span>
                {!medication.in_stock && requestAction(medication)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Dialog: request a medication */}
      <ConfirmDialog
        open={Boolean(requesting)}
        title={requesting ? t('preorders.requestTitle', { name: requesting.name }) : ''}
        lead={t('preorders.requestLead')}
        confirmLabel={t('preorders.sendRequest')}
        busy={busy}
        onCancel={() => setRequesting(null)}
        onConfirm={sendRequest}
      >
        {requestError && <div className="alert alert--error" role="alert">{requestError}</div>}
        <div className="form-grid">
          <label className="field">
            <span className="field__label">{t('common.quantity')}</span>
            <input
              type="number"
              min={1}
              max={PREORDER_MAX_QUANTITY}
              step={1}
              value={requestForm.quantity}
              onChange={(event) => setRequestForm({ ...requestForm, quantity: event.target.value })}
            />
            <span className="field__hint">{t('preorders.quantityHint', { count: PREORDER_MAX_QUANTITY })}</span>
          </label>
        </div>
        <label className="field">
          <span className="field__label">{t('preorders.noteLabel')}</span>
          <textarea
            rows={3}
            maxLength={PREORDER_NOTE_MAX_LENGTH}
            value={requestForm.note}
            onChange={(event) => setRequestForm({ ...requestForm, note: event.target.value })}
            dir="auto"
          />
        </label>
      </ConfirmDialog>

      {/* Dialog: cancel a request */}
      <ConfirmDialog
        open={Boolean(cancelling)}
        title={t('preorders.cancelTitle')}
        lead={cancelling ? t('preorders.cancelLead', { name: cancelling.medication_name }) : ''}
        confirmLabel={t('preorders.cancelRequest')}
        cancelLabel={t('preorders.keepRequest')}
        busy={busy}
        onCancel={() => setCancelling(null)}
        onConfirm={confirmCancel}
      />
    </>
  );
}
