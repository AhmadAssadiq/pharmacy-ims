import { useCallback, useEffect, useState } from 'react';
import { fetchMedications } from '../../api/medications';
import { fetchRecentSales, previewSale, recordSale } from '../../api/sales';
import { formatDate } from '../../utils/expiry';

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

  const handleSubmit = async () => {
    setError(null);
    setFieldErrors({});
    setNotice(null);

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
        `Sale complete: ${sale.total_quantity} unit(s) across ${sale.lines.length} medication(s), total ${sale.total_price.toFixed(2)}.`
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
        <h1>Dispense medication</h1>
        <div className="status-line">Sales recorded here feed the demand forecast</div>
      </div>

      {notice && <div className="alert alert--success" role="status">{notice}</div>}
      {error && <div className="alert alert--error" role="alert">{error}</div>}

      <form className="card" onSubmit={handleAddLine} aria-label="Add a medication to the sale">
        <h2>Add to sale</h2>
        {loading ? (
          <p className="muted">Loading catalog...</p>
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
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
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
        <h2>Current sale</h2>
        {fieldErrors.items && <div className="alert alert--error" role="alert">{fieldErrors.items}</div>}

        {items.length === 0 ? (
          <p className="empty">Nothing added yet. Add one or more medications above to build the sale.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Medication</th>
                    <th className="num">Quantity</th>
                    <th>Drawn from (nearest expiry first)</th>
                    <th className="num">Line total</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.medication_id}>
                      <td><strong>{item.medication_name}</strong></td>
                      <td className="num">{item.quantity}</td>
                      <td>
                        <ul className="sale-preview__list">
                          {item.allocations.map((line) => (
                            <li key={line.batch_id}>
                              {line.take} from the lot expiring {line.expiry_date}
                              <span className="muted"> — {line.remaining_after} left afterwards</span>
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
              <strong>Total {totalPrice.toFixed(2)}</strong>
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn--primary" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Recording...' : 'Complete sale'}
              </button>
              <button type="button" className="btn" onClick={() => setItems([])} disabled={saving}>
                Clear sale
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Recent sales</h2>
        {sales.length === 0 ? (
          <p className="empty">No sales recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Medication</th>
                  <th className="num">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td>{formatDate(sale.date)}</td>
                    <td>{sale.medication_name}</td>
                    <td className="num">{sale.quantity_sold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
