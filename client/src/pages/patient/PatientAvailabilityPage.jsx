// The patient's medications page (FR 7, FR 2.2): every medication the pharmacy sells, with
// its price and whether it is in stock - never quantities or suppliers.
// Any medication, in stock or not, can be added to an order (GP2 addition); the order being
// put together is shown at the top (components/order/OrderCart.jsx). An out-of-stock
// medication also lists what is in stock instead.
// The patient's placed orders are on the "My orders" page (PatientOrdersPage.jsx).
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { fetchAvailability } from '../../api/availability';
import AlternativesList from '../../components/AlternativesList';
import OrderCart from '../../components/order/OrderCart';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/useI18n';
import constants from '../../../../shared/constants.json';

const { PREORDER_MAX_QUANTITY, PREORDER_MAX_ITEMS } = constants;

// The cart is remembered in the browser tab (sessionStorage), so it survives a visit to
// another page. It is kept per user, so one patient never sees another patient's cart.
function loadCart(userId) {
  try {
    const saved = sessionStorage.getItem(`pims_cart_${userId}`);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveCart(userId, cart) {
  try {
    sessionStorage.setItem(`pims_cart_${userId}`, JSON.stringify(cart));
  } catch {
    // The cart still works for this page visit if the browser refuses to store it
  }
}

// One cart line for a medication from the list
function toCartLine(medication, quantity) {
  return {
    medication_id: medication.id,
    name: medication.name,
    unit_price: medication.unit_price,
    requires_prescription: medication.requires_prescription,
    in_stock: medication.in_stock,
    quantity,
  };
}

export default function PatientAvailabilityPage() {
  const { t, te, formatPrice } = useI18n();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [medications, setMedications] = useState([]);
  const [cart, setCart] = useState(() => loadCart(user.id));
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [orderPlaced, setOrderPlaced] = useState(false);

  // Changes the cart and remembers it
  function changeCart(newCart) {
    setCart(newCart);
    saveCart(user.id, newCart);
  }

  // On load: the medication list. If the patient came here through "Order again" on the
  // My orders page, that order's medications are put in the cart.
  useEffect(() => {
    async function loadPage() {
      try {
        const data = await fetchAvailability();
        setMedications(data.medications);

        const reorder = location.state?.reorder;
        if (reorder) {
          fillCartFromOrder(reorder, data.medications);
          // Forget the "order again" request, so refreshing the page does not repeat it
          navigate(location.pathname, { replace: true, state: null });
        }
      } catch (loadError) {
        setError(te(loadError));
      } finally {
        setLoading(false);
      }
    }
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Order again": replaces the cart with the medications of an earlier order.
  // `reorder` is { id, items: [{ medication_id, medication_name, quantity }] }.
  // A medication the pharmacy no longer sells is left out and named in a message.
  function fillCartFromOrder(reorder, list) {
    const lines = [];
    const skippedNames = [];
    for (const item of reorder.items) {
      const medication = list.find((candidate) => candidate.id === item.medication_id);
      if (medication) {
        lines.push(toCartLine(medication, item.quantity));
      } else {
        skippedNames.push(item.medication_name);
      }
    }
    changeCart(lines);
    if (skippedNames.length > 0) {
      setError(t('orders.reorderSkipped', { names: skippedNames.join(', ') }));
    }
    if (lines.length > 0) {
      setNotice(t('orders.reorderAdded', { id: reorder.id }));
    }
  }

  // Adds one unit of a medication to the cart (or one more, if it is already there)
  function addToCart(medication) {
    setError(null);
    setNotice(null);
    setOrderPlaced(false);
    const existing = cart.find((line) => line.medication_id === medication.id);
    if (existing) {
      const quantity = Math.min((Number(existing.quantity) || 0) + 1, PREORDER_MAX_QUANTITY);
      changeCart(cart.map((line) => (line.medication_id === medication.id ? { ...line, quantity } : line)));
      return;
    }
    if (cart.length >= PREORDER_MAX_ITEMS) {
      setError(t('orders.tooManyItems', { count: PREORDER_MAX_ITEMS }));
      return;
    }
    changeCart([...cart, toCartLine(medication, 1)]);
  }

  // The quantity box of a cart line was changed (kept as typed; checked when ordering)
  function changeQuantity(medicationId, text) {
    changeCart(cart.map((line) => (line.medication_id === medicationId ? { ...line, quantity: text } : line)));
  }

  function removeFromCart(medicationId) {
    changeCart(cart.filter((line) => line.medication_id !== medicationId));
  }

  // The order was saved: empty the cart and say so
  function handlePlaced() {
    changeCart([]);
    setError(null);
    setNotice(null);
    setOrderPlaced(true);
  }

  // How many units of a medication are in the cart (0 when it is not there)
  function quantityInCart(medicationId) {
    const line = cart.find((item) => item.medication_id === medicationId);
    return line ? Number(line.quantity) || 0 : 0;
  }

  // The medications matching the search box (name, category or active ingredient)
  const search = searchText.trim().toLowerCase();
  const visibleMedications = medications.filter((medication) => {
    if (!search) {
      return true;
    }
    return (
      medication.name.toLowerCase().includes(search) ||
      medication.category.toLowerCase().includes(search) ||
      medication.active_ingredient.toLowerCase().includes(search)
    );
  });

  return (
    <>
      <div className="page-header">
        <h1>{t('availability.title')}</h1>
      </div>

      {orderPlaced && (
        <div className="alert alert--success" role="status">
          {t('orders.placed')} <Link to="/patient/orders">{t('orders.viewOrders')}</Link>
        </div>
      )}
      {notice && <div className="alert alert--success" role="status">{notice}</div>}
      {error && <div className="alert alert--error" role="alert">{error}</div>}

      {/* The order being put together */}
      <OrderCart
        cart={cart}
        onChangeQuantity={changeQuantity}
        onRemove={removeFromCart}
        onClear={() => changeCart([])}
        onPlaced={handlePlaced}
      />

      {/* The medication list with its search box */}
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
          {visibleMedications.map((medication) => {
            const inCart = quantityInCart(medication.id);
            return (
              <li key={medication.id} className="list__item">
                <span>
                  <strong><bdi>{medication.name}</bdi></strong>
                  {medication.requires_prescription && (
                    <span className="badge badge--muted order-items__rx">{t('availability.rx')}</span>
                  )}
                  <br />
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    <bdi>{medication.category}</bdi> · {t('availability.price', { price: formatPrice(medication.unit_price) })}
                  </span>
                  {/* Out of stock: what is in stock instead */}
                  {!medication.in_stock && <AlternativesList alternatives={medication.alternatives} />}
                </span>
                <span className="list__actions">
                  <span className={`badge ${medication.in_stock ? 'badge--success' : 'badge--danger'}`}>
                    {medication.in_stock ? t('availability.inStock') : t('availability.outOfStock')}
                  </span>
                  {inCart > 0 && <span className="muted" style={{ fontSize: 'var(--fs-small)' }}>{t('availability.inOrder', { count: inCart })}</span>}
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => addToCart(medication)}
                    aria-label={t('availability.addLabel', { name: medication.name })}
                  >
                    {t('availability.addToOrder')}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
