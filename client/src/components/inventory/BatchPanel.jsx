import { useCallback, useEffect, useState } from 'react';
import { createBatch, deleteBatch, fetchBatches, updateBatch } from '../../api/medications';
import { expiryStatus, formatDate } from '../../utils/expiry';

const EMPTY = { quantity: '', expiry_date: '', batch_number: '' };

function toForm(batch) {
  return {
    quantity: String(batch.quantity),
    expiry_date: formatDate(batch.expiry_date),
    batch_number: batch.batch_number || '',
  };
}

/**
 * Stock lots for one medication (UC-1). Receiving a delivery adds a lot with its
 * own expiry date; dispensing always draws from the lot expiring soonest.
 */
export default function BatchPanel({ medication, onChanged }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchBatches(medication.id);
      setBatches(data.batches);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [medication.id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action) => {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      await action();
      await load();
      onChanged?.();
      return true;
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.details || {});
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (await run(() => createBatch(medication.id, form))) setForm(EMPTY);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (await run(() => updateBatch(editingId, editForm))) setEditingId(null);
  };

  const handleDelete = async (batch) => {
    if (!window.confirm(`Remove the lot of ${batch.quantity} expiring ${formatDate(batch.expiry_date)}?`)) return;
    await run(() => deleteBatch(batch.id));
  };

  const startEdit = (batch) => {
    setEditingId(batch.id);
    setEditForm(toForm(batch));
    setFieldErrors({});
  };

  const batchField = (state, setState, name, label, props = {}) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        name={name}
        value={state[name]}
        onChange={(e) => setState({ ...state, [name]: e.target.value })}
        {...props}
      />
      {fieldErrors[name] && <span className="field__error">{fieldErrors[name]}</span>}
    </label>
  );

  if (loading) return <p className="muted">Loading stock lots...</p>;

  return (
    <div className="batch-panel">
      <h3>Stock lots</h3>
      {error && <div className="alert alert--error" role="alert">{error}</div>}

      {batches.length === 0 ? (
        <p className="empty">No stock lots. Add one below to put this medication back in stock.</p>
      ) : (
        <table className="table table--compact">
          <thead>
            <tr>
              <th>Expiry date</th>
              <th>Quantity</th>
              <th>Lot number</th>
              <th>Received</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => {
              const status = expiryStatus(batch.expiry_date);
              if (editingId === batch.id) {
                return (
                  <tr key={batch.id}>
                    <td colSpan={6}>
                      <form className="batch-panel__form" onSubmit={handleSaveEdit}>
                        {batchField(editForm, setEditForm, 'expiry_date', 'Expiry date', { type: 'date', required: true })}
                        {batchField(editForm, setEditForm, 'quantity', 'Quantity', {
                          type: 'number', min: 0, step: 1, required: true,
                        })}
                        {batchField(editForm, setEditForm, 'batch_number', 'Lot number', { maxLength: 60 })}
                        <div className="form-actions">
                          <button type="submit" className="btn btn--sm btn--primary" disabled={saving}>
                            {saving ? 'Saving...' : 'Save lot'}
                          </button>{' '}
                          <button type="button" className="btn btn--sm" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={batch.id} className={status.modifier === 'danger' ? 'is-flagged' : undefined}>
                  <td>{formatDate(batch.expiry_date)}</td>
                  <td>{batch.quantity}</td>
                  <td>{batch.batch_number || '—'}</td>
                  <td>{formatDate(batch.received_date)}</td>
                  <td><span className={`badge badge--${status.modifier}`}>{status.label}</span></td>
                  <td className="actions">
                    <button type="button" className="btn btn--sm" onClick={() => startEdit(batch)}>Edit</button>{' '}
                    <button
                      type="button"
                      className="btn btn--sm btn--danger"
                      onClick={() => handleDelete(batch)}
                      disabled={saving}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <form className="batch-panel__form" onSubmit={handleAdd} aria-label="Receive stock">
        <h4>Receive stock</h4>
        <div className="form-grid">
          {batchField(form, setForm, 'quantity', 'Quantity received', {
            type: 'number', min: 0, step: 1, required: true,
          })}
          {batchField(form, setForm, 'expiry_date', 'Expiry date of this lot', { type: 'date', required: true })}
          {batchField(form, setForm, 'batch_number', 'Lot number (optional)', { maxLength: 60 })}
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving...' : 'Add lot'}
          </button>
        </div>
      </form>
    </div>
  );
}
