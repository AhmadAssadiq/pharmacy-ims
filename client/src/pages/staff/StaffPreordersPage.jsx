// The staff orders queue (GP2 addition).
// Patients order medications ahead of time, in stock or not; staff move each order on:
//   pending  -> "Mark ready"   only when every medication is on the shelf (stock is received
//                              on the Add stock page) and the prescription, if any, is approved
//   ready    -> "Collected"    sells every medication, soonest-expiring lot first - so it asks
//                              for confirmation
//   pending or ready -> "Cancel"
// An order with a prescription-only medication comes with a photo of the prescription:
// "Check prescription" shows it, to approve or to reject with a reason (which cancels the order).
// Every action opens a dialog; a failed action keeps the dialog open with the reason in it.
import { useEffect, useRef, useState } from 'react';
import { decidePrescription, fetchOrders, updateOrderStatus } from '../../api/preorders';
import ConfirmDialog from '../../components/ConfirmDialog';
import { PreorderStatus } from '../../components/StatusMark';
import PhoneLink from '../../components/PhoneLink';
import StyledText from '../../components/StyledText';
import { OrderItems, PrescriptionMark, paymentText } from '../../components/order/OrderDetails';
import PrescriptionImage from '../../components/order/PrescriptionImage';
import { useI18n } from '../../i18n/useI18n';
import constants from '../../../../shared/constants.json';

const { PREORDER_STATUS, PRESCRIPTION_STATUS, PAYMENT_STATUS } = constants;

// The filter buttons: all, pending, ready, collected, cancelled
const FILTERS = ['all', ...Object.values(PREORDER_STATUS)];

export default function StaffPreordersPage() {
  const { t, te, formatDateTime, formatPrice } = useI18n();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [filter, setFilter] = useState(PREORDER_STATUS.PENDING);
  // The open status dialog: { order, status } (the status it will move to), or null
  const [confirming, setConfirming] = useState(null);
  // The open prescription dialog: the order whose prescription is being checked, or null
  const [checking, setChecking] = useState(null);
  const [decision, setDecision] = useState('approve'); // 'approve' or 'reject'
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState(null);
  const errorRef = useRef(null);

  // Loads (or reloads) every order
  async function loadOrders() {
    try {
      const data = await fetchOrders();
      setOrders(data.preorders);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  // When an error appears, move the keyboard focus to it
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  // How many orders have each status (for the filter buttons)
  const counts = { all: orders.length };
  for (const status of Object.values(PREORDER_STATUS)) {
    counts[status] = 0;
  }
  for (const order of orders) {
    counts[order.status] += 1;
  }

  const visibleOrders = filter === 'all' ? orders : orders.filter((order) => order.status === filter);

  // Opens the dialog for moving `order` to `status`
  function openStatusDialog(order, status) {
    setDialogError(null);
    setConfirming({ order, status });
  }

  // Opens the "check prescription" dialog
  function openPrescriptionDialog(order) {
    setDialogError(null);
    setDecision('approve');
    setReason('');
    setChecking(order);
  }

  // Saves the status change chosen in the dialog
  async function confirmStatusChange() {
    const { order, status } = confirming;
    setError(null);
    setNotice(null);
    setDialogError(null);
    setBusy(true);
    try {
      await updateOrderStatus(order.id, status);
      await loadOrders();
      setNotice(t(`orders.moved.${status}`, { id: order.id, patient: order.patient_name }));
      setConfirming(null); // only a success closes the dialog
    } catch (saveError) {
      setDialogError(te(saveError));
    } finally {
      setBusy(false);
    }
  }

  // Saves the decision on a prescription: approve, or reject with a reason
  async function confirmPrescription() {
    setError(null);
    setNotice(null);
    setDialogError(null);
    if (decision === 'reject' && !reason.trim()) {
      setDialogError(t('orders.rejectReasonRequired'));
      return;
    }
    setBusy(true);
    try {
      await decidePrescription(checking.id, decision, reason);
      await loadOrders();
      setNotice(t(decision === 'approve' ? 'orders.approved' : 'orders.rejected', { id: checking.id }));
      setChecking(null);
    } catch (saveError) {
      setDialogError(te(saveError));
    } finally {
      setBusy(false);
    }
  }

  // The status dialog's title, text and button for each kind of status change
  let dialog = null;
  if (confirming) {
    const { order, status } = confirming;
    const details = { id: order.id, patient: order.patient_name };
    if (status === PREORDER_STATUS.READY) {
      dialog = { title: t('orders.readyTitle', details), lead: t('orders.readyLead', details), confirmLabel: t('preorders.markReady') };
    } else if (status === PREORDER_STATUS.COLLECTED) {
      // Cash is taken now; a card order was already paid (demo)
      const isPaid = order.payment_status === PAYMENT_STATUS.PAID;
      const paymentLine = isPaid ? t('orders.collectPaid') : t('orders.collectCash', { total: formatPrice(order.total_price) });
      dialog = {
        title: t('orders.collectTitle', details),
        lead: `${t('orders.collectLead', details)} ${paymentLine}`,
        confirmLabel: t('preorders.collectConfirm'),
      };
    } else {
      dialog = { title: t('orders.cancelTitle'), lead: t('orders.staffCancelLead', details), confirmLabel: t('orders.cancel') };
    }
  }

  // The one-line finding at the top: ready orders first, then waiting ones
  let finding = t('preorders.findingNone');
  if (counts.ready > 0) {
    finding = <StyledText id="preorders.findingReady" count={counts.ready} />;
  } else if (counts.pending > 0) {
    finding = <StyledText id="preorders.findingPending" count={counts.pending} />;
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
        {!loading && visibleOrders.length === 0 && <p className="empty empty--framed">{t('preorders.staffEmpty')}</p>}
        {!loading && visibleOrders.length > 0 && (
          <div className="table-wrap" tabIndex={0} role="region" aria-label={t('preorders.regionLabel')}>
            <table className="table">
              <caption className="sr-only">{t('preorders.caption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('orders.colOrder')}</th>
                  <th scope="col">{t('preorders.colPatient')}</th>
                  <th scope="col">{t('orders.colMedications')}</th>
                  <th scope="col">{t('orders.colPayment')}</th>
                  <th scope="col">{t('common.status')}</th>
                  <th scope="col" className="actions">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => {
                  const isPending = order.status === PREORDER_STATUS.PENDING;
                  const isReady = order.status === PREORDER_STATUS.READY;
                  const prescriptionWaiting = isPending && order.prescription_status === PRESCRIPTION_STATUS.WAITING;
                  return (
                    <tr key={order.id}>
                      <th scope="row" style={{ fontWeight: 500 }}>
                        {t('orders.orderNumber', { id: order.id })}
                        <span className="med-sub date">{formatDateTime(order.created_at)}</span>
                      </th>
                      <td>
                        <bdi>{order.patient_name}</bdi>
                        <span className="med-sub"><PhoneLink phone={order.patient_phone} /></span>
                      </td>
                      <td>
                        {/* Each medication, with whether it is on the shelf right now */}
                        <OrderItems items={order.items} showStock={isPending || isReady} />
                        {order.note && <span className="med-sub" dir="auto">{t('orders.noteLine', { note: order.note })}</span>}
                      </td>
                      <td>
                        <span className="num">{formatPrice(order.total_price)}</span>
                        <span className="med-sub">{paymentText(order, t)}</span>
                      </td>
                      <td>
                        <span className="badges">
                          <PreorderStatus status={order.status} t={t} />
                          <PrescriptionMark status={order.prescription_status} />
                        </span>
                        {order.prescription_reason && (
                          <span className="med-sub">{t('orders.rejectedReason', { reason: order.prescription_reason })}</span>
                        )}
                      </td>
                      <td className="actions">
                        {prescriptionWaiting && (
                          <button type="button" className="btn btn--sm btn--primary" onClick={() => openPrescriptionDialog(order)}>
                            {t('orders.checkPrescription')}
                          </button>
                        )}
                        {isPending && !prescriptionWaiting && (
                          <button type="button" className="btn btn--sm" onClick={() => openStatusDialog(order, PREORDER_STATUS.READY)}>
                            {t('preorders.markReady')}
                          </button>
                        )}
                        {isReady && (
                          <button type="button" className="btn btn--sm btn--primary" onClick={() => openStatusDialog(order, PREORDER_STATUS.COLLECTED)}>
                            {t('preorders.markCollected')}
                          </button>
                        )}
                        {(isPending || isReady) && (
                          <>
                            {' '}
                            <button type="button" className="btn btn--sm btn--ghost" onClick={() => openStatusDialog(order, PREORDER_STATUS.CANCELLED)}>
                              {t('orders.cancel')}
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

      {/* Dialog: mark ready, collected or cancelled */}
      <ConfirmDialog
        open={Boolean(confirming)}
        title={dialog ? dialog.title : ''}
        lead={dialog ? dialog.lead : undefined}
        confirmLabel={dialog ? dialog.confirmLabel : undefined}
        cancelLabel={t('sell.goBack')}
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={confirmStatusChange}
      >
        {dialogError && (
          <div className="alert alert--error" role="alert">
            {dialogError}
          </div>
        )}
        {confirming && <OrderItems items={confirming.order.items} showStock />}
      </ConfirmDialog>

      {/* Dialog: check a prescription */}
      <ConfirmDialog
        open={Boolean(checking)}
        title={checking ? t('orders.prescriptionDialogTitle', { id: checking.id }) : ''}
        lead={checking ? t('orders.prescriptionDialogLead', { patient: checking.patient_name }) : undefined}
        confirmLabel={decision === 'approve' ? t('orders.approve') : t('orders.reject')}
        cancelLabel={t('sell.goBack')}
        busy={busy}
        onCancel={() => setChecking(null)}
        onConfirm={confirmPrescription}
      >
        {dialogError && (
          <div className="alert alert--error" role="alert">
            {dialogError}
          </div>
        )}
        {checking && (
          <>
            <PrescriptionImage orderId={checking.id} />
            <OrderItems items={checking.items} />
            <fieldset className="cart__section">
              <legend className="sr-only">{t('orders.decisionLegend')}</legend>
              <label className="check">
                <input type="radio" name="prescription-decision" checked={decision === 'approve'} onChange={() => setDecision('approve')} />
                <span>{t('orders.approveChoice')}</span>
              </label>
              <label className="check">
                <input type="radio" name="prescription-decision" checked={decision === 'reject'} onChange={() => setDecision('reject')} />
                <span>{t('orders.rejectChoice')}</span>
              </label>
              {decision === 'reject' && (
                <label className="field">
                  <span className="field__label">{t('orders.rejectReasonLabel')}</span>
                  <textarea rows={2} maxLength={255} value={reason} onChange={(event) => setReason(event.target.value)} dir="auto" />
                </label>
              )}
            </fieldset>
          </>
        )}
      </ConfirmDialog>
    </>
  );
}
