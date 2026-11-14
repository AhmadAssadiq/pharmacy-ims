// The patient's order being put together ("the cart") on the medications page (GP2 addition).
// It shows the chosen medications with their quantities and the total, checks them for
// interactions, asks for a prescription photo when one is needed, takes a note and the
// payment method, and places the order after a confirmation.
//
// cart: [{ medication_id, name, unit_price, requires_prescription, in_stock, quantity }]
// onChangeQuantity(medicationId, text) / onRemove(medicationId) / onClear(): change the cart
// onPlaced(order): called after the order was saved, so the page can empty the cart
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createOrder } from '../../api/preorders';
import ConfirmDialog from '../ConfirmDialog';
import InteractionNotice from '../InteractionNotice';
import PaymentDialog from './PaymentDialog';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/useI18n';
import constants from '../../../../shared/constants.json';

const {
  PAYMENT_METHOD,
  PREORDER_MAX_QUANTITY,
  PREORDER_NOTE_MAX_LENGTH,
  CHAT_IMAGE_MAX_BYTES,
  CHAT_IMAGE_TYPES,
} = constants;

// How long the demo "Processing payment..." step is shown, in milliseconds
const DEMO_PAYMENT_MS = 1800;

// Waits `milliseconds` (used only for the demo payment step)
function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export default function OrderCart({ cart, onChangeQuantity, onRemove, onClear, onPlaced }) {
  const { t, te, formatPrice } = useI18n();
  const { user } = useAuth();
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHOD.CASH);
  const [prescriptionFile, setPrescriptionFile] = useState(null);
  const [error, setError] = useState(null);
  const [reviewing, setReviewing] = useState(false); // the "place this order?" dialog is open
  const [busy, setBusy] = useState(false);
  // The demo card payment pop-up: null (closed), 'processing' or 'success'
  const [paymentStage, setPaymentStage] = useState(null);
  const [placedOrder, setPlacedOrder] = useState(null);
  const fileRef = useRef(null);

  // The total of the cart, and whether it needs a prescription
  let total = 0;
  for (const line of cart) {
    total += line.unit_price * (Number(line.quantity) || 0);
  }
  const needsPrescription = cart.some((line) => line.requires_prescription);
  const payingByCard = paymentMethod === PAYMENT_METHOD.CARD;

  // A prescription photo was chosen: check its type and size here first (the server
  // checks again), so the message is in the patient's language
  function handlePickPrescription(event) {
    const file = event.target.files?.[0];
    setError(null);
    if (!file) {
      return;
    }
    if (!CHAT_IMAGE_TYPES.includes(file.type)) {
      setError(t('chat.onlyImages'));
      event.target.value = '';
      return;
    }
    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      setError(t('chat.imageTooLarge', { count: CHAT_IMAGE_MAX_BYTES / (1024 * 1024) }));
      event.target.value = '';
      return;
    }
    setPrescriptionFile(file);
  }

  // "Place order" pressed: check the cart, then open the confirmation dialog
  function handleReview() {
    setError(null);
    for (const line of cart) {
      const quantity = Number(line.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > PREORDER_MAX_QUANTITY) {
        setError(t('preorders.quantityInvalid', { count: PREORDER_MAX_QUANTITY }));
        return;
      }
    }
    if (needsPrescription && !prescriptionFile) {
      setError(t('orders.prescriptionMissing'));
      return;
    }
    setReviewing(true);
  }

  // Sends the order to the server and returns the saved order
  async function sendOrder() {
    const lines = cart.map((line) => ({ medication_id: line.medication_id, quantity: Number(line.quantity) }));
    const data = await createOrder({ lines, note, paymentMethod, prescriptionFile: needsPrescription ? prescriptionFile : null });
    return data.preorder;
  }

  // Shows why the order was refused: the first field message if there is one
  function showOrderError(orderError) {
    const fieldMessages = orderError.details ? Object.values(orderError.details) : [];
    setError(fieldMessages.length > 0 ? fieldMessages[0] : te(orderError));
  }

  // After the order was saved: empty the form and tell the page
  function finish(order) {
    setNote('');
    setPrescriptionFile(null);
    setPaymentMethod(PAYMENT_METHOD.CASH);
    if (fileRef.current) {
      fileRef.current.value = '';
    }
    onPlaced(order);
  }

  // Confirmed in the dialog
  async function handleConfirm() {
    setError(null);

    // Card: show the demo payment step, then save the order (the server marks it paid)
    if (payingByCard) {
      setReviewing(false);
      setPaymentStage('processing');
      try {
        await wait(DEMO_PAYMENT_MS);
        const order = await sendOrder();
        setPlacedOrder(order);
        setPaymentStage('success');
      } catch (orderError) {
        setPaymentStage(null);
        showOrderError(orderError);
      }
      return;
    }

    // Cash: just save the order
    setBusy(true);
    try {
      const order = await sendOrder();
      setReviewing(false);
      finish(order);
    } catch (orderError) {
      setReviewing(false);
      showOrderError(orderError);
    } finally {
      setBusy(false);
    }
  }

  // "Done" on the "Payment successful" pop-up
  function handlePaymentDone() {
    setPaymentStage(null);
    finish(placedOrder);
  }

  return (
    <section className="card" aria-labelledby="cart-heading">
      <div className="card__header">
        <h2 id="cart-heading">{t('orders.cartTitle')}</h2>
        <span className="card__note">{t('orders.cartNote')}</span>
      </div>

      {error && <div className="alert alert--error" role="alert">{error}</div>}

      {cart.length === 0 ? (
        <p className="empty empty--framed">{t('orders.cartEmpty')}</p>
      ) : (
        <>
          {/* The chosen medications */}
          <ul className="list">
            {cart.map((line) => (
              <li key={line.medication_id} className="list__item">
                <span>
                  <strong><bdi>{line.name}</bdi></strong>
                  {line.requires_prescription && <span className="badge badge--muted order-items__rx">{t('orders.rx')}</span>}
                  <br />
                  <span className="muted" style={{ fontSize: 'var(--fs-small)' }}>
                    {t('orders.eachPrice', { price: formatPrice(line.unit_price) })}
                    {!line.in_stock && ` · ${t('orders.outOfStockLine')}`}
                  </span>
                </span>
                <span className="list__actions">
                  <input
                    type="number"
                    className="cart__quantity"
                    min={1}
                    max={PREORDER_MAX_QUANTITY}
                    step={1}
                    value={line.quantity}
                    onChange={(event) => onChangeQuantity(line.medication_id, event.target.value)}
                    aria-label={t('orders.quantityOf', { name: line.name })}
                  />
                  <span className="num cart__price">{formatPrice(line.unit_price * (Number(line.quantity) || 0))}</span>
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => onRemove(line.medication_id)}>
                    {t('common.remove')}
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <div className="sale-total">
            <span>{t('common.medications', { count: cart.length })}</span>
            <span className="sale-total__value">{t('common.total', { amount: formatPrice(total) })}</span>
          </div>

          {/* Two or more medications: check them against each other (it only warns) */}
          <InteractionNotice medicationIds={cart.map((line) => line.medication_id)} />

          {/* A prescription-only medication: the order needs a photo of the prescription */}
          {needsPrescription && (
            <div className="cart__section">
              <h3>{t('orders.prescriptionTitle')}</h3>
              <p className="muted">{t('orders.prescriptionWhy')}</p>
              <input
                ref={fileRef}
                type="file"
                accept={CHAT_IMAGE_TYPES.join(',')}
                onChange={handlePickPrescription}
                aria-label={t('orders.prescriptionTitle')}
              />
            </div>
          )}

          {/* How it will be paid */}
          <fieldset className="cart__section">
            <legend>{t('orders.paymentTitle')}</legend>
            <label className="check">
              <input
                type="radio"
                name="payment-method"
                checked={paymentMethod === PAYMENT_METHOD.CASH}
                onChange={() => setPaymentMethod(PAYMENT_METHOD.CASH)}
              />
              <span>{t('orders.payCash')}</span>
            </label>
            <label className="check">
              <input
                type="radio"
                name="payment-method"
                checked={payingByCard}
                onChange={() => setPaymentMethod(PAYMENT_METHOD.CARD)}
              />
              <span>{t('orders.payCard')}</span>
            </label>
          </fieldset>

          <label className="field">
            <span className="field__label">{t('preorders.noteLabel')}</span>
            <textarea
              rows={2}
              maxLength={PREORDER_NOTE_MAX_LENGTH}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              dir="auto"
            />
          </label>

          <div className="form-actions">
            {/* The pharmacy phones when the order is ready, so it needs a phone number first */}
            {user.phone ? (
              <button type="button" className="btn btn--commit" onClick={handleReview}>
                {t('orders.placeOrder')}
              </button>
            ) : (
              <Link to="/patient/account#phone" className="btn">
                {t('phone.neededToRequest')}
              </Link>
            )}
            <button type="button" className="btn" onClick={onClear}>
              {t('orders.clearOrder')}
            </button>
          </div>
        </>
      )}

      {/* "Place this order?" */}
      <ConfirmDialog
        open={reviewing}
        title={t('orders.reviewTitle')}
        lead={t(payingByCard ? 'orders.reviewLeadCard' : 'orders.reviewLeadCash', { total: formatPrice(total) })}
        confirmLabel={payingByCard ? t('orders.confirmPay', { total: formatPrice(total) }) : t('orders.placeOrder')}
        busy={busy}
        onCancel={() => setReviewing(false)}
        onConfirm={handleConfirm}
      >
        <ul className="modal__list">
          {cart.map((line) => (
            <li key={line.medication_id} className="modal__line">
              <span><bdi>{line.name}</bdi></span>
              <span className="modal__qty">{line.quantity}</span>
            </li>
          ))}
        </ul>
      </ConfirmDialog>

      {/* The demo card payment: "Processing payment..." then "Payment successful" */}
      <PaymentDialog stage={paymentStage} amount={total} onDone={handlePaymentDone} />
    </section>
  );
}
