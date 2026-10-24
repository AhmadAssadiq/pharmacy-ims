import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPreorders, updatePreorderStatus } from '../../api/preorders';
import ConfirmDialog from '../../components/ConfirmDialog';
import { PreorderStatus } from '../../components/StatusMark';
import PhoneLink from '../../components/PhoneLink';
import { useI18n } from '../../i18n/I18nContext';
import constants from '../../../../shared/constants.json';

const { PREORDER_STATUS } = constants;
const FILTERS = ['all', ...Object.values(PREORDER_STATUS)];

/** YYYY-MM-DD for tomorrow: the earliest expiry a delivery for a preorder may have. */
function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const EMPTY_DELIVERY = { mode: 'deliver', quantity: '', expiry_date: '', batch_number: '' };

/**
 * Staff preorder queue (GP2 addition). Requests arrive from patients for
 * medications that are out of stock. Marking one ready records the delivery
 * that came in for it - the lot goes into stock there and then - unless the
 * stock was already received through Add stock. Collecting dispenses it
 * nearest-expiry-first in the same step, which is why it sits behind a confirm.
 */
export default function StaffPreordersPage() {
  const { t, te, formatDateTime } = useI18n();
  const [preorders, setPreorders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [filter, setFilter] = useState(PREORDER_STATUS.PENDING);
  const [confirming, setConfirming] = useState(null); // { preorder, status }
  const [busyId, setBusyId] = useState(null);
  const [delivery, setDelivery] = useState(EMPTY_DELIVERY);
  const [dialogError, setDialogError] = useState(null);
  const [deliveryErrors, setDeliveryErrors] = useState({});
  const errorRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchPreorders();
      setPreorders(data.preorders);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Move the keyboard to the error, as Dispense does.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const counts = useMemo(() => {
    const byStatus = Object.fromEntries(FILTERS.map((key) => [key, 0]));
    for (const p of preorders) byStatus[p.status] += 1;
    byStatus.all = preorders.length;
    return byStatus;
  }, [preorders]);

  const visible = filter === 'all' ? preorders : preorders.filter((p) => p.status === filter);

  const open = (preorder, status) => {
    setDialogError(null);
    setDeliveryErrors({});
    setDelivery({ ...EMPTY_DELIVERY, quantity: String(preorder.quantity) });
    setConfirming({ preorder, status });
  };

  /** The delivery as the server expects it, or field errors in the user's language. */
  const checkDelivery = (preorder) => {
    const errors = {};
    const quantity = Number(delivery.quantity);
    if (!Number.isInteger(quantity) || quantity < preorder.quantity) {
      errors.quantity = t('preorders.deliveryQuantityError', { count: preorder.quantity });
    }
    if (!delivery.expiry_date || delivery.expiry_date < tomorrow()) errors.expiry_date = t('preorders.deliveryExpiryError');
    return { errors, value: { quantity, expiry_date: delivery.expiry_date, batch_number: delivery.batch_number } };
  };

  // A failed move keeps the dialog open with the reason in it; only success closes it.
  const move = async (preorder, status) => {
    setError(null);
    setNotice(null);
    setDialogError(null);
    let lot;
    if (status === PREORDER_STATUS.READY && delivery.mode === 'deliver') {
      const check = checkDelivery(preorder);
      setDeliveryErrors(check.errors);
      if (Object.keys(check.errors).length > 0) return;
      lot = check.value;
    }
    setBusyId(preorder.id);
    try {
      await updatePreorderStatus(preorder.id, status, lot);
      await load();
      const key = lot ? 'preorders.moved.readyDelivered' : `preorders.moved.${status}`;
      setNotice(t(key, { name: preorder.medication_name, patient: preorder.patient_name, quantity: lot?.quantity }));
      setConfirming(null);
    } catch (err) {
      setDialogError(te(err));
      setDeliveryErrors(err.details || {});
    } finally {
      setBusyId(null);
    }
  };

  const dialog = confirming && {
    ready: {
      title: t('preorders.readyTitle'),
      lead: t('preorders.readyLead', {
        quantity: confirming.preorder.quantity,
        name: confirming.preorder.medication_name,
        patient: confirming.preorder.patient_name,
      }),
      confirmLabel: t('preorders.markReady'),
    },
    collected: {
      title: t('preorders.collectTitle'),
      lead: t('preorders.collectLead', {
        quantity: confirming.preorder.quantity,
        name: confirming.preorder.medication_name,
        patient: confirming.preorder.patient_name,
      }),
      confirmLabel: t('preorders.collectConfirm'),
    },
    cancelled: {
      title: t('preorders.cancelTitle'),
      lead: t('preorders.staffCancelLead', { patient: confirming.preorder.patient_name }),
      confirmLabel: t('preorders.cancelRequest'),
    },
  }[confirming.status];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t('preorders.staffTitle')}</h1>
          {!loading && (
            <p className="page-finding">
              {counts.ready > 0
                ? t('preorders.findingReady', { count: <strong>{counts.ready}</strong>, n: counts.ready })
                : counts.pending > 0
                  ? t('preorders.findingPending', { count: <strong>{counts.pending}</strong>, n: counts.pending })
                  : t('preorders.findingNone')}
            </p>
          )}
        </div>
      </div>

      {notice && (
        <div className="alert alert--success" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="alert alert--error" role="alert" tabIndex={-1} ref={errorRef}>
          {te(error)}
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          {FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              className="chip"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {key === 'all' ? t('inventory.chipAll') : t(`preorders.status.${key}`)}
              <span className="chip__count">{counts[key]}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <p className="empty">{t('common.loading')}</p>
        ) : visible.length === 0 ? (
          <p className="empty empty--framed">{t('preorders.staffEmpty')}</p>
        ) : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label={t('preorders.regionLabel')}>
            <table className="table">
              <caption className="sr-only">{t('preorders.caption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('preorders.colRequested')}</th>
                  <th scope="col">{t('preorders.colPatient')}</th>
                  <th scope="col">{t('common.medication')}</th>
                  <th scope="col" className="num">{t('common.quantity')}</th>
                  <th scope="col">{t('preorders.colNote')}</th>
                  <th scope="col">{t('common.status')}</th>
                  <th scope="col" className="actions">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id}>
                    <td className="date">{formatDateTime(p.created_at)}</td>
                    <td>
                      <bdi>{p.patient_name}</bdi>
                      <span className="med-sub"><PhoneLink phone={p.patient_phone} /></span>
                    </td>
                    <th scope="row" style={{ fontWeight: 500 }}><bdi>{p.medication_name}</bdi></th>
                    <td className="num">{p.quantity}</td>
                    <td className="muted">{p.note ? <bdi>{p.note}</bdi> : '—'}</td>
                    <td><PreorderStatus status={p.status} t={t} /></td>
                    <td className="actions">
                      {p.status === PREORDER_STATUS.PENDING && (
                        <button
                          type="button"
                          className="btn btn--sm"
                          disabled={busyId === p.id}
                          onClick={() => open(p, PREORDER_STATUS.READY)}
                        >
                          {t('preorders.markReady')}
                        </button>
                      )}
                      {p.status === PREORDER_STATUS.READY && (
                        <button
                          type="button"
                          className="btn btn--sm btn--primary"
                          disabled={busyId === p.id}
                          onClick={() => open(p, PREORDER_STATUS.COLLECTED)}
                        >
                          {t('preorders.markCollected')}
                        </button>
                      )}
                      {(p.status === PREORDER_STATUS.PENDING || p.status === PREORDER_STATUS.READY) && (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="btn btn--sm btn--ghost"
                            disabled={busyId === p.id}
                            onClick={() => open(p, PREORDER_STATUS.CANCELLED)}
                          >
                            {t('preorders.cancelRequest')}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirming)}
        title={dialog?.title ?? ''}
        lead={dialog?.lead}
        confirmLabel={dialog?.confirmLabel}
        cancelLabel={t('sell.goBack')}
        busy={Boolean(busyId)}
        onCancel={() => setConfirming(null)}
        onConfirm={() => move(confirming.preorder, confirming.status)}
      >
        {dialogError && (
          <div className="alert alert--error" role="alert">
            {dialogError}
          </div>
        )}
        {confirming?.status === PREORDER_STATUS.READY && (
          <fieldset className="delivery">
            <legend className="sr-only">{t('preorders.deliveryLegend')}</legend>
            <label className="delivery__choice">
              <input
                type="radio"
                name="delivery-mode"
                checked={delivery.mode === 'deliver'}
                onChange={() => setDelivery({ ...delivery, mode: 'deliver' })}
              />
              {t('preorders.deliveryRecord')}
            </label>
            {delivery.mode === 'deliver' && (
              <div className="form-grid delivery__fields">
                <label className="field">
                  <span className="field__label">{t('batch.quantityReceived')}</span>
                  <input
                    type="number"
                    min={confirming.preorder.quantity}
                    step={1}
                    value={delivery.quantity}
                    onChange={(e) => setDelivery({ ...delivery, quantity: e.target.value })}
                    aria-invalid={deliveryErrors.quantity ? 'true' : undefined}
                  />
                  {deliveryErrors.quantity && <span className="field__error">{deliveryErrors.quantity}</span>}
                </label>
                <label className="field">
                  <span className="field__label">{t('batch.lotExpiry')}</span>
                  <input
                    type="date"
                    min={tomorrow()}
                    value={delivery.expiry_date}
                    onChange={(e) => setDelivery({ ...delivery, expiry_date: e.target.value })}
                    aria-invalid={deliveryErrors.expiry_date ? 'true' : undefined}
                  />
                  {deliveryErrors.expiry_date && <span className="field__error">{deliveryErrors.expiry_date}</span>}
                </label>
                <label className="field">
                  <span className="field__label">{t('batch.lotNumberOptional')}</span>
                  <input
                    maxLength={60}
                    value={delivery.batch_number}
                    onChange={(e) => setDelivery({ ...delivery, batch_number: e.target.value })}
                  />
                </label>
              </div>
            )}
            <label className="delivery__choice">
              <input
                type="radio"
                name="delivery-mode"
                checked={delivery.mode === 'shelf'}
                onChange={() => setDelivery({ ...delivery, mode: 'shelf' })}
              />
              {t('preorders.deliveryOnShelf')}
            </label>
          </fieldset>
        )}
      </ConfirmDialog>
    </>
  );
}
