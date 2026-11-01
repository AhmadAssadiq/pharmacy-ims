// The staff preorder queue (GP2 addition).
// Patients request medications that are out of stock; staff move each request on:
//   pending  -> "Mark ready"     usually records the delivery that came in for it (it goes into stock),
//                                unless the stock was already received on the Add stock page
//   ready    -> "Collected"      sells it, soonest-expiring lot first - so it asks for confirmation
//   pending or ready -> "Cancel"
// Every action opens a dialog; a failed action keeps the dialog open with the reason in it.
import { useEffect, useRef, useState } from 'react';
import { fetchPreorders, updatePreorderStatus } from '../../api/preorders';
import ConfirmDialog from '../../components/ConfirmDialog';
import { PreorderStatus } from '../../components/StatusMark';
import PhoneLink from '../../components/PhoneLink';
import StyledText from '../../components/StyledText';
import { useI18n } from '../../i18n/useI18n';
import constants from '../../../../shared/constants.json';

const { PREORDER_STATUS } = constants;

// The filter buttons: all, pending, ready, collected, cancelled
const FILTERS = ['all', ...Object.values(PREORDER_STATUS)];

// Tomorrow as YYYY-MM-DD: a delivery for a preorder must still be in date after today
function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

// The delivery form in the "Mark ready" dialog.
// mode: 'deliver' = record the lot that arrived, 'shelf' = the stock is already on the shelf
const EMPTY_DELIVERY = { mode: 'deliver', quantity: '', expiry_date: '', batch_number: '' };

export default function StaffPreordersPage() {
  const { t, te, formatDateTime } = useI18n();
  const [preorders, setPreorders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [filter, setFilter] = useState(PREORDER_STATUS.PENDING);
  // The open dialog: { preorder, status } (the status it will move to), or null
  const [confirming, setConfirming] = useState(null);
  const [busyId, setBusyId] = useState(null); // the request being saved
  const [delivery, setDelivery] = useState(EMPTY_DELIVERY);
  const [dialogError, setDialogError] = useState(null);
  const [deliveryErrors, setDeliveryErrors] = useState({});
  const errorRef = useRef(null);

  // Loads (or reloads) every request
  async function loadPreorders() {
    try {
      const data = await fetchPreorders();
      setPreorders(data.preorders);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPreorders();
  }, []);

  // When an error appears, move the keyboard focus to it
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  // How many requests have each status (for the filter buttons)
  const counts = { all: preorders.length };
  for (const status of Object.values(PREORDER_STATUS)) {
    counts[status] = 0;
  }
  for (const preorder of preorders) {
    counts[preorder.status] += 1;
  }

  const visiblePreorders = filter === 'all' ? preorders : preorders.filter((preorder) => preorder.status === filter);

  // Opens the dialog for moving `preorder` to `status`
  function openDialog(preorder, status) {
    setDialogError(null);
    setDeliveryErrors({});
    setDelivery({ ...EMPTY_DELIVERY, quantity: String(preorder.quantity) });
    setConfirming({ preorder, status });
  }

  // Checks the delivery form before sending it. Returns { errors, lot }.
  function checkDelivery(preorder) {
    const errors = {};
    const quantity = Number(delivery.quantity);
    if (!Number.isInteger(quantity) || quantity < preorder.quantity) {
      errors.quantity = t('preorders.deliveryQuantityError', { count: preorder.quantity });
    }
    if (!delivery.expiry_date || delivery.expiry_date < tomorrow()) {
      errors.expiry_date = t('preorders.deliveryExpiryError');
    }
    const lot = { quantity, expiry_date: delivery.expiry_date, batch_number: delivery.batch_number };
    return { errors, lot };
  }

  // Saves the status change chosen in the dialog
  async function confirmStatusChange() {
    const { preorder, status } = confirming;
    setError(null);
    setNotice(null);
    setDialogError(null);

    // "Mark ready" with a delivery: check the delivery form first
    let lot;
    if (status === PREORDER_STATUS.READY && delivery.mode === 'deliver') {
      const check = checkDelivery(preorder);
      setDeliveryErrors(check.errors);
      if (Object.keys(check.errors).length > 0) {
        return;
      }
      lot = check.lot;
    }

    setBusyId(preorder.id);
    try {
      await updatePreorderStatus(preorder.id, status, lot);
      await loadPreorders();
      const messageKey = lot ? 'preorders.moved.readyDelivered' : `preorders.moved.${status}`;
      setNotice(t(messageKey, { name: preorder.medication_name, patient: preorder.patient_name, quantity: lot ? lot.quantity : undefined }));
      setConfirming(null); // only a success closes the dialog
    } catch (saveError) {
      setDialogError(te(saveError));
      setDeliveryErrors(saveError.details || {});
    } finally {
      setBusyId(null);
    }
  }

  // The dialog's title, text and button for each kind of status change
  let dialog = null;
  if (confirming) {
    const { preorder, status } = confirming;
    const details = { quantity: preorder.quantity, name: preorder.medication_name, patient: preorder.patient_name };
    if (status === PREORDER_STATUS.READY) {
      dialog = { title: t('preorders.readyTitle'), lead: t('preorders.readyLead', details), confirmLabel: t('preorders.markReady') };
    } else if (status === PREORDER_STATUS.COLLECTED) {
      dialog = { title: t('preorders.collectTitle'), lead: t('preorders.collectLead', details), confirmLabel: t('preorders.collectConfirm') };
    } else {
      dialog = {
        title: t('preorders.cancelTitle'),
        lead: t('preorders.staffCancelLead', { patient: preorder.patient_name }),
        confirmLabel: t('preorders.cancelRequest'),
      };
    }
  }

  // The one-line finding at the top: ready requests first, then waiting ones
  let finding = t('preorders.findingNone');
  if (counts.ready > 0) {
    finding = <StyledText id="preorders.findingReady" count={counts.ready} />;
  } else if (counts.pending > 0) {
    finding = <StyledText id="preorders.findingPending" count={counts.pending} />;
  }

  // Changes one field of the delivery form
  function changeDelivery(field, value) {
    setDelivery({ ...delivery, [field]: value });
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t('preorders.staffTitle')}</h1>
          {!loading && <p className="page-finding">{finding}</p>}
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
        {/* Filter buttons with counts */}
        <div className="toolbar">
          {FILTERS.map((key) => (
            <button key={key} type="button" className="chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {key === 'all' ? t('inventory.chipAll') : t(`preorders.status.${key}`)}
              <span className="chip__count">{counts[key]}</span>
            </button>
          ))}
        </div>

        {loading && <p className="empty">{t('common.loading')}</p>}
        {!loading && visiblePreorders.length === 0 && <p className="empty empty--framed">{t('preorders.staffEmpty')}</p>}
        {!loading && visiblePreorders.length > 0 && (
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
                {visiblePreorders.map((preorder) => {
                  const isPending = preorder.status === PREORDER_STATUS.PENDING;
                  const isReady = preorder.status === PREORDER_STATUS.READY;
                  const isBusy = busyId === preorder.id;
                  return (
                    <tr key={preorder.id}>
                      <td className="date">{formatDateTime(preorder.created_at)}</td>
                      <td>
                        <bdi>{preorder.patient_name}</bdi>
                        <span className="med-sub"><PhoneLink phone={preorder.patient_phone} /></span>
                      </td>
                      <th scope="row" style={{ fontWeight: 500 }}><bdi>{preorder.medication_name}</bdi></th>
                      <td className="num">{preorder.quantity}</td>
                      <td className="muted">{preorder.note ? <bdi>{preorder.note}</bdi> : '—'}</td>
                      <td><PreorderStatus status={preorder.status} t={t} /></td>
                      <td className="actions">
                        {isPending && (
                          <button type="button" className="btn btn--sm" disabled={isBusy} onClick={() => openDialog(preorder, PREORDER_STATUS.READY)}>
                            {t('preorders.markReady')}
                          </button>
                        )}
                        {isReady && (
                          <button
                            type="button"
                            className="btn btn--sm btn--primary"
                            disabled={isBusy}
                            onClick={() => openDialog(preorder, PREORDER_STATUS.COLLECTED)}
                          >
                            {t('preorders.markCollected')}
                          </button>
                        )}
                        {(isPending || isReady) && (
                          <>
                            {' '}
                            <button
                              type="button"
                              className="btn btn--sm btn--ghost"
                              disabled={isBusy}
                              onClick={() => openDialog(preorder, PREORDER_STATUS.CANCELLED)}
                            >
                              {t('preorders.cancelRequest')}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirming)}
        title={dialog ? dialog.title : ''}
        lead={dialog ? dialog.lead : undefined}
        confirmLabel={dialog ? dialog.confirmLabel : undefined}
        cancelLabel={t('sell.goBack')}
        busy={Boolean(busyId)}
        onCancel={() => setConfirming(null)}
        onConfirm={confirmStatusChange}
      >
        {dialogError && (
          <div className="alert alert--error" role="alert">
            {dialogError}
          </div>
        )}

        {/* "Mark ready": record the delivery, or say the stock is already on the shelf */}
        {confirming && confirming.status === PREORDER_STATUS.READY && (
          <fieldset className="delivery">
            <legend className="sr-only">{t('preorders.deliveryLegend')}</legend>
            <label className="delivery__choice">
              <input type="radio" name="delivery-mode" checked={delivery.mode === 'deliver'} onChange={() => changeDelivery('mode', 'deliver')} />
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
                    onChange={(event) => changeDelivery('quantity', event.target.value)}
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
                    onChange={(event) => changeDelivery('expiry_date', event.target.value)}
                    aria-invalid={deliveryErrors.expiry_date ? 'true' : undefined}
                  />
                  {deliveryErrors.expiry_date && <span className="field__error">{deliveryErrors.expiry_date}</span>}
                </label>
                <label className="field">
                  <span className="field__label">{t('batch.lotNumberOptional')}</span>
                  <input maxLength={60} value={delivery.batch_number} onChange={(event) => changeDelivery('batch_number', event.target.value)} />
                </label>
              </div>
            )}
            <label className="delivery__choice">
              <input type="radio" name="delivery-mode" checked={delivery.mode === 'shelf'} onChange={() => changeDelivery('mode', 'shelf')} />
              {t('preorders.deliveryOnShelf')}
            </label>
          </fieldset>
        )}
      </ConfirmDialog>
    </>
  );
}
