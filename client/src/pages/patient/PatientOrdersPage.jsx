// The patient's "My orders" page (GP2 addition): their own orders, open and past.
//   - Open orders (pending or ready) come first; a pending one can be cancelled.
//   - Past orders (collected or cancelled) follow, newest first.
// Each order shows its medications with prices, the total, how it is paid, and the state of
// its prescription. "Order again" puts an order's medications back in the cart.
// The server only ever sends the signed-in patient's own orders.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cancelMyOrder, fetchMyOrders } from '../../api/preorders';
import ConfirmDialog from '../../components/ConfirmDialog';
import { PreorderStatus } from '../../components/StatusMark';
import { OrderItems, PrescriptionMark, paymentText } from '../../components/order/OrderDetails';
import PrescriptionImage from '../../components/order/PrescriptionImage';
import { useI18n } from '../../i18n/useI18n';
import constants from '../../../../shared/constants.json';

const { PREORDER_STATUS, PAYMENT_STATUS } = constants;

export default function PatientOrdersPage() {
  const { t, te, formatDateTime, formatPrice } = useI18n();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [cancelling, setCancelling] = useState(null); // the order being cancelled (dialog open), or null
  const [busy, setBusy] = useState(false);
  const [shownPrescriptionId, setShownPrescriptionId] = useState(null); // the order whose photo is shown

  // Loads (or reloads) the patient's orders
  async function loadOrders() {
    try {
      const data = await fetchMyOrders();
      setOrders(data.preorders);
    } catch (loadError) {
      setError(te(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmCancel() {
    setBusy(true);
    setError(null);
    try {
      await cancelMyOrder(cancelling.id);
      await loadOrders();
      setNotice(t('orders.cancelled', { id: cancelling.id }));
    } catch (cancelError) {
      setError(te(cancelError));
    } finally {
      setBusy(false);
      setCancelling(null);
    }
  }

  // "Order again": go to the medications page with this order's medications for the cart
  function orderAgain(order) {
    navigate('/patient/availability', { state: { reorder: { id: order.id, items: order.items } } });
  }

  const isOpen = (order) => order.status === PREORDER_STATUS.PENDING || order.status === PREORDER_STATUS.READY;
  const openOrders = orders.filter(isOpen);
  const pastOrders = orders.filter((order) => !isOpen(order));

  // One order as a card
  function orderCard(order) {
    const isPending = order.status === PREORDER_STATUS.PENDING;
    const prescriptionShown = shownPrescriptionId === order.id;
    return (
      <li key={order.id} className="order-card">
        <div className="order-card__header">
          <span>
            <strong>{t('orders.orderNumber', { id: order.id })}</strong>
            <span className="muted"> · {t('orders.placedOn', { date: formatDateTime(order.created_at) })}</span>
          </span>
          <span className="badges">
            <PreorderStatus status={order.status} t={t} />
            <PrescriptionMark status={order.prescription_status} />
          </span>
        </div>

        <OrderItems items={order.items} />

        <div className="sale-total">
          <span>{paymentText(order, t)}</span>
          <span className="sale-total__value">{t('common.total', { amount: formatPrice(order.total_price) })}</span>
        </div>

        {order.prescription_reason && (
          <p className="text-danger">{t('orders.rejectedReason', { reason: order.prescription_reason })}</p>
        )}
        {order.note && <p className="muted" dir="auto">{t('orders.noteLine', { note: order.note })}</p>}

        <div className="form-actions">
          {isPending && (
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setCancelling(order)}>
              {t('orders.cancel')}
            </button>
          )}
          {!isOpen(order) && (
            <button type="button" className="btn btn--sm" onClick={() => orderAgain(order)}>
              {t('orders.orderAgain')}
            </button>
          )}
          {order.has_prescription && (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              aria-expanded={prescriptionShown}
              onClick={() => setShownPrescriptionId(prescriptionShown ? null : order.id)}
            >
              {prescriptionShown ? t('orders.hidePrescription') : t('orders.showPrescription')}
            </button>
          )}
        </div>
        {prescriptionShown && <PrescriptionImage orderId={order.id} />}
      </li>
    );
  }

  // The text of the cancel dialog: a card payment is refunded (demo)
  let cancelLead = '';
  if (cancelling) {
    const wasPaid = cancelling.payment_status === PAYMENT_STATUS.PAID;
    cancelLead = t(wasPaid ? 'orders.cancelLeadCard' : 'orders.cancelLead', { id: cancelling.id });
  }

  return (
    <>
      <div className="page-header">
        <h1>{t('orders.mineTitle')}</h1>
        <Link to="/patient/availability" className="btn btn--primary">
          {t('orders.browse')}
        </Link>
      </div>

      {notice && <div className="alert alert--success" role="status">{notice}</div>}
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {loading && <p className="muted">{t('common.loading')}</p>}

      {!loading && orders.length === 0 && (
        <div className="card">
          <p className="empty empty--framed">{t('orders.none')}</p>
        </div>
      )}

      {openOrders.length > 0 && (
        <section className="card" aria-labelledby="open-orders">
          <h2 id="open-orders">{t('orders.open')}</h2>
          <ul className="order-list">{openOrders.map(orderCard)}</ul>
        </section>
      )}

      {pastOrders.length > 0 && (
        <section className="card" aria-labelledby="past-orders">
          <h2 id="past-orders">{t('orders.past')}</h2>
          <ul className="order-list">{pastOrders.map(orderCard)}</ul>
        </section>
      )}

      {/* Dialog: cancel an order */}
      <ConfirmDialog
        open={Boolean(cancelling)}
        title={t('orders.cancelTitle')}
        lead={cancelLead}
        confirmLabel={t('orders.cancel')}
        cancelLabel={t('orders.keep')}
        busy={busy}
        onCancel={() => setCancelling(null)}
        onConfirm={confirmCancel}
      />
    </>
  );
}
