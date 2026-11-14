// Small pieces that show an order, shared by the patient's "My orders" page and the staff
// orders page (GP2 addition).
import StatusMark from '../StatusMark';
import { useI18n } from '../../i18n/useI18n';
import constants from '../../../../shared/constants.json';

const { PAYMENT_METHOD, PAYMENT_STATUS, PRESCRIPTION_STATUS } = constants;

/**
 * The medications of an order: "Amoxicillin 500mg × 2 ... 9.60".
 * showStock (staff only): also says whether each line is on the shelf right now.
 */
export function OrderItems({ items, showStock = false }) {
  const { t, formatPrice } = useI18n();
  return (
    <ul className="order-items">
      {items.map((item) => (
        <li key={item.medication_id} className="order-items__line">
          <span>
            <bdi>{item.medication_name}</bdi> × {item.quantity}
            {item.requires_prescription && <span className="badge badge--muted order-items__rx">{t('orders.rx')}</span>}
            {showStock && (
              <span className={`order-items__stock ${item.in_stock ? '' : 'text-danger'}`}>
                {item.in_stock
                  ? t('orders.lineInStock')
                  : t('orders.lineShort', { available: item.available, quantity: item.quantity })}
              </span>
            )}
          </span>
          <span className="num">{formatPrice(item.unit_price * item.quantity)}</span>
        </li>
      ))}
    </ul>
  );
}

/** How an order is paid, in words: "Paid by card (demo)", "Cash on collection", "Refunded (demo)"... */
export function paymentText(order, t) {
  if (order.payment_status === PAYMENT_STATUS.REFUNDED) {
    return t('orders.payment.refunded');
  }
  if (order.payment_method === PAYMENT_METHOD.CARD) {
    return t('orders.payment.cardPaid');
  }
  return order.payment_status === PAYMENT_STATUS.PAID ? t('orders.payment.cashPaid') : t('orders.payment.cashDue');
}

/** The prescription state of an order as a badge, or nothing when it needs none. */
export function PrescriptionMark({ status }) {
  const { t } = useI18n();
  if (status === PRESCRIPTION_STATUS.NOT_NEEDED) {
    return null;
  }
  const marks = {
    [PRESCRIPTION_STATUS.WAITING]: { kind: 'clock', tone: 'warning' },
    [PRESCRIPTION_STATUS.APPROVED]: { kind: 'ok', tone: 'success' },
    [PRESCRIPTION_STATUS.REJECTED]: { kind: 'out', tone: 'danger' },
  };
  const mark = marks[status];
  return <StatusMark kind={mark.kind} tone={mark.tone} label={t(`orders.prescription.${status}`)} />;
}
