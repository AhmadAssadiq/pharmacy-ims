import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAvailability } from '../../api/availability';
import { cancelMyPreorder, createPreorder, fetchMyPreorders } from '../../api/preorders';
import ConfirmDialog from '../../components/ConfirmDialog';
import { PreorderStatus } from '../../components/StatusMark';
import { useI18n } from '../../i18n/I18nContext';
import constants from '../../../../shared/constants.json';

const { PREORDER_MAX_QUANTITY, PREORDER_NOTE_MAX_LENGTH, PREORDER_STATUS } = constants;
const OPEN = [PREORDER_STATUS.PENDING, PREORDER_STATUS.READY];

/**
 * Patient medication availability view (FR 7, FR 2.2). Shows only whether a
 * medication is in stock - never the exact quantity.
 *
 * An out-of-stock medication can be requested as a preorder (GP2 addition);
 * the patient's own requests and their status are listed above the catalog.
 */
export default function PatientAvailabilityPage() {
  const { t, te, formatDate } = useI18n();
  const [medications, setMedications] = useState([]);
  const [preorders, setPreorders] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // The request being written (a medication) and the one being cancelled (a preorder).
  const [requesting, setRequesting] = useState(null);
  const [form, setForm] = useState({ quantity: '1', note: '' });
  const [formError, setFormError] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadPreorders = useCallback(async () => {
    const data = await fetchMyPreorders();
    setPreorders(data.preorders);
  }, []);

  useEffect(() => {
    Promise.all([fetchAvailability(), loadPreorders()])
      .then(([data]) => setMedications(data.medications))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [loadPreorders]);

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return medications;
    return medications.filter(
      (m) => m.name.toLowerCase().includes(term) || m.category.toLowerCase().includes(term)
    );
  }, [medications, filter]);

  // A medication with an open request shows that instead of offering a second one.
  const openRequestFor = useMemo(
    () => new Set(preorders.filter((p) => OPEN.includes(p.status)).map((p) => p.medication_id)),
    [preorders]
  );

  const flash = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(null), 6000);
  };

  const startRequest = (medication) => {
    setRequesting(medication);
    setForm({ quantity: '1', note: '' });
    setFormError(null);
  };

  const submitRequest = async () => {
    // The dialog is not a <form>, so check the quantity here, in the user's language.
    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > PREORDER_MAX_QUANTITY) {
      setFormError(t('preorders.quantityInvalid', { count: PREORDER_MAX_QUANTITY }));
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await createPreorder({ medication_id: requesting.id, quantity: form.quantity, note: form.note });
      await loadPreorders();
      flash(t('preorders.requestSent', { name: requesting.name }));
      setRequesting(null);
    } catch (err) {
      const field = err.details && Object.values(err.details)[0];
      setFormError(field || te(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = async () => {
    setBusy(true);
    try {
      await cancelMyPreorder(cancelling.id);
      await loadPreorders();
      flash(t('preorders.requestCancelled', { name: cancelling.medication_name }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      setCancelling(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>{t('availability.title')}</h1>
      </div>

      {notice && <div className="alert alert--success" role="status">{notice}</div>}
      {error && <div className="alert alert--error" role="alert">{te(error)}</div>}

      {preorders.length > 0 && (
        <section className="card" aria-labelledby="my-requests-heading">
          <div className="card__header">
            <h2 id="my-requests-heading">{t('preorders.mineTitle')}</h2>
            <span className="card__note">{t('preorders.mineNote')}</span>
          </div>
          <ul className="list">
            {preorders.map((p) => (
              <li key={p.id} className="list__item">
                <span>
                  <strong><bdi>{p.medication_name}</bdi></strong>
                  <br />
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    {t('preorders.mineLine', {
                      quantity: <span className="num">{p.quantity}</span>,
                      date: <span className="date">{formatDate(p.created_at)}</span>,
                    })}
                  </span>
                </span>
                <span className="list__actions">
                  <PreorderStatus status={p.status} t={t} />
                  {p.status === PREORDER_STATUS.PENDING && (
                    <button type="button" className="btn btn--sm btn--ghost" onClick={() => setCancelling(p)}>
                      {t('preorders.cancelRequest')}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="card">
        <label className="field">
          <span className="field__label">{t('availability.find')}</span>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('availability.placeholder')}
          />
        </label>

        {loading && <p className="muted">{t('common.loading')}</p>}
        {!loading && visible.length === 0 && <p className="empty">{t('availability.none')}</p>}

        <ul className="list">
          {visible.map((m) => (
            <li key={m.id} className="list__item">
              <span>
                <strong><bdi>{m.name}</bdi></strong>
                <br />
                <span className="muted" style={{ fontSize: '0.85rem' }}><bdi>{m.category}</bdi></span>
              </span>
              <span className="list__actions">
                <span className={`badge ${m.in_stock ? 'badge--success' : 'badge--danger'}`}>
                  {m.in_stock ? t('availability.inStock') : t('availability.outOfStock')}
                </span>
                {!m.in_stock &&
                  (openRequestFor.has(m.id) ? (
                    <span className="muted" style={{ fontSize: 'var(--fs-small)' }}>{t('preorders.alreadyRequested')}</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => startRequest(m)}
                      aria-label={t('preorders.requestLabel', { name: m.name })}
                    >
                      {t('preorders.request')}
                    </button>
                  ))}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={Boolean(requesting)}
        title={requesting ? t('preorders.requestTitle', { name: requesting.name }) : ''}
        lead={t('preorders.requestLead')}
        confirmLabel={t('preorders.sendRequest')}
        busy={busy}
        onCancel={() => setRequesting(null)}
        onConfirm={submitRequest}
      >
        {formError && <div className="alert alert--error" role="alert">{formError}</div>}
        <div className="form-grid">
          <label className="field">
            <span className="field__label">{t('common.quantity')}</span>
            <input
              type="number"
              min={1}
              max={PREORDER_MAX_QUANTITY}
              step={1}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
            <span className="field__hint">{t('preorders.quantityHint', { count: PREORDER_MAX_QUANTITY })}</span>
          </label>
        </div>
        <label className="field">
          <span className="field__label">{t('preorders.noteLabel')}</span>
          <textarea
            rows={3}
            maxLength={PREORDER_NOTE_MAX_LENGTH}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            dir="auto"
          />
        </label>
      </ConfirmDialog>

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
