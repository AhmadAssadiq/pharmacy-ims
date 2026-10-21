import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMedications } from '../../api/medications';
import { fetchRecentSales, previewSale, recordSale } from '../../api/sales';
import { formatDate } from '../../utils/expiry';
import ConfirmDialog from '../../components/ConfirmDialog';

/**
 * Dispensing counter. A sale is a basket of one or more medications; completing
 * it depletes each medication's lot closest to expiry first (FEFO) and writes
 * the transaction into the sales history the forecasting model trains on.
 */
export default function StaffSellPage() {
  const [medications, setMedications] = useState([]);
  const [sales, setSales] = useState([]);
  const [items, setItems] = useState([]);
  const [medicationId, setMedicationId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const errorRef = useRef(null);

  const load = useCallback(async () => {
    const [medicationData, salesData] = await Promise.all([fetchMedications(), fetchRecentSales()]);
    setMedications(medicationData.medications);
    setSales(salesData.sales);
  }, []);

  useEffect(() => {
    load()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [load]);

  const selected = medications.find((m) => String(m.id) === String(medicationId)) || null;
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

  /**
   * Adds a line, previewing the lots it will draw from. A medication already in
   * the basket has its quantity merged, matching how the server allocates stock.
   */
  const handleAddLine = async (e) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setNotice(null);

    const medication = medications.find((m) => String(m.id) === String(medicationId));
    if (!medication) {
      setFieldErrors({ medication_id: 'Select a medication first' });
      return;
    }
    const requested = Number(quantity);
    if (!Number.isInteger(requested) || requested <= 0) {
      setFieldErrors({ quantity: 'Enter a quantity of at least 1' });
      return;
    }

    const existing = items.find((item) => item.medication_id === medication.id);
    const merged = (existing?.quantity || 0) + requested;

    setAdding(true);
    try {
      const { preview } = await previewSale(medication.id, merged);
      if (preview.shortfall > 0) {
        setFieldErrors({
          quantity: existing
            ? `Only ${preview.available} unit(s) of ${medication.name} available and ${existing.quantity} already in this sale`
            : `Only ${preview.available} unit(s) of ${medication.name} available`,
        });
        return;
      }

      const line = {
        medication_id: medication.id,
        medication_name: medication.name,
        unit_price: Number(medication.unit_price),
        quantity: merged,
        allocations: preview.allocations,
      };
      setItems((prev) =>
        existing ? prev.map((item) => (item.medication_id === medication.id ? line : item)) : [...prev, line]
      );
      setMedicationId('');
      setQuantity('1');
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const removeLine = (id) => setItems((prev) => prev.filter((item) => item.medication_id !== id));

  // Move the keyboard to the error, rather than leaving it at the bottom of the page.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  /* Dispensing is irreversible, so it is the one action behind a gate. */
  const handleSubmit = async () => {
    setError(null);
    setFieldErrors({});
    setNotice(null);
    setConfirming(false);

    if (items.length === 0) {
      setError('Add at least one medication to the sale.');
      return;
    }

    setSaving(true);
    try {
      const data = await recordSale({
        items: items.map(({ medication_id, quantity: qty }) => ({ medication_id, quantity: qty })),
      });
      const { sale } = data;
      setNotice(
        `Dispensed ${sale.total_quantity} unit(s) across ${sale.lines.length} medication(s), total ${sale.total_price.toFixed(2)}. Stock has been reduced.`
      );
      setItems([]);
      await load();
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.details || {});
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Dispense</h1>
          <p className="page-finding">
            Stock leaves the shelf when a sale is completed. Each line is drawn from the lot
            closest to expiry first, and the move cannot be undone.
          </p>
        </div>
      </div>

      {notice && (
        <div className="alert alert--success" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="alert alert--error" role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </div>
      )}

      <form className="card" onSubmit={handleAddLine} aria-label="Add a medication to the sale">
        <div className="card__header">
          <h2>Add to sale</h2>
          <span className="card__note">Out-of-stock medications cannot be selected.</span>
        </div>
        {loading ? (
          <p className="empty">Loading catalog...</p>
        ) : (
          <div className="form-grid">
            <label className="field">
              <span className="field__label">Medication</span>
              <select value={medicationId} onChange={(e) => setMedicationId(e.target.value)}>
                <option value="">Select a medication...</option>
                {medications.map((med) => (
                  <option key={med.id} value={med.id} disabled={med.quantity <= 0}>
                    {med.name} ({med.quantity} in stock{med.quantity <= 0 ? ' - unavailable' : ''})
                  </option>
                ))}
              </select>
              {fieldErrors.medication_id && <span className="field__error">{fieldErrors.medication_id}</span>}
            </label>

            <label className="field">
              <span className="field__label">Quantity</span>
              <input
                type="number"
                min={1}
                step={1}
                max={selected ? selected.quantity : undefined}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                aria-invalid={fieldErrors.quantity ? 'true' : undefined}
                aria-describedby={selected ? 'qty-available' : undefined}
              />
              {selected && (
                <span className="field__hint" id="qty-available">
                  <span className="num">{selected.quantity}</span> available
                </span>
              )}
              {fieldErrors.quantity && <span className="field__error">{fieldErrors.quantity}</span>}
            </label>

            <div className="field">
              <span className="field__label" aria-hidden="true">&nbsp;</span>
              <button type="submit" className="btn" disabled={adding}>
                {adding ? 'Checking stock...' : 'Add to sale'}
              </button>
            </div>
          </div>
        )}
      </form>

      <div className="card">
        <div className="card__header">
          <h2>Current sale</h2>
          {items.length > 0 && <span className="card__note">Check each lot before dispensing.</span>}
        </div>
        {fieldErrors.items && <div className="alert alert--error" role="alert">{fieldErrors.items}</div>}

        {items.length === 0 ? (
          <p className="empty empty--framed">
            Nothing added yet. Add one or more medications above to build the sale.
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">
                  Medications in the sale being built, with the lots each will be drawn from.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Medication</th>
                    <th scope="col" className="num">Quantity</th>
                    <th scope="col">Drawn from (nearest expiry first)</th>
                    <th scope="col" className="num">Line total</th>
                    <th scope="col" className="actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.medication_id}>
                      <th scope="row" style={{ fontWeight: 500 }}>{item.medication_name}</th>
                      <td className="num">{item.quantity}</td>
                      <td>
                        <ul className="sale-preview__list">
                          {item.allocations.map((line) => (
                            <li key={line.batch_id}>
                              <span className="num">{line.take}</span> from the lot expiring{' '}
                              <span className="date">{formatDate(line.expiry_date)}</span>
                              <span className="muted">
                                {' '}
                                — <span className="num">{line.remaining_after}</span> left afterwards
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="num">{(item.unit_price * item.quantity).toFixed(2)}</td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn btn--sm btn--danger"
                          onClick={() => removeLine(item.medication_id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="sale-total">
              <span>
                {items.length} medication{items.length === 1 ? '' : 's'} · {totalQuantity} unit
                {totalQuantity === 1 ? '' : 's'}
              </span>
              <span className="sale-total__value">Total {totalPrice.toFixed(2)}</span>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn btn--commit"
                onClick={() => setConfirming(true)}
                disabled={saving}
              >
                Review and dispense
              </button>
              <button type="button" className="btn" onClick={() => setItems([])} disabled={saving}>
                Clear sale
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card__header">
          <h2>Recent sales</h2>
          <span className="card__note">These feed the demand forecast.</span>
        </div>
        {sales.length === 0 ? (
          <p className="empty">No sales recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">The most recent sales recorded at this pharmacy.</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Medication</th>
                  <th scope="col" className="num">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="date">{formatDate(sale.date)}</td>
                    <td>{sale.medication_name}</td>
                    <td className="num">{sale.quantity_sold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title="Dispense this sale?"
        lead="Stock leaves the shelf now. This cannot be undone."
        confirmLabel={`Dispense ${totalQuantity} unit${totalQuantity === 1 ? '' : 's'}`}
        cancelLabel="Go back"
        busy={saving}
        onCancel={() => setConfirming(false)}
        onConfirm={handleSubmit}
      >
        <ul className="modal__list">
          {items.map((item) => (
            <li key={item.medication_id} className="modal__line">
              <span>
                {item.medication_name}
                {item.allocations.map((line) => (
                  <span className="modal__lot" key={line.batch_id}>
                    <span className="num">{line.take}</span> from the lot expiring{' '}
                    <span className="date">{formatDate(line.expiry_date)}</span>
                  </span>
                ))}
              </span>
              <span className="modal__qty">{item.quantity}</span>
            </li>
          ))}
        </ul>
        <div className="sale-total" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
          <span>
            {items.length} medication{items.length === 1 ? '' : 's'} ·{' '}
            <span className="num">{totalQuantity}</span> unit{totalQuantity === 1 ? '' : 's'}
          </span>
          <span className="sale-total__value">Total {totalPrice.toFixed(2)}</span>
        </div>
      </ConfirmDialog>
    </>
  );
}
