import { useEffect, useState } from 'react';
import constants from '../../../../shared/constants.json';

const EMPTY = {
  name: '',
  category: '',
  unit_price: '',
  supplier_info: '',
  low_stock_threshold: '',
  quantity: '',
  expiry_date: '',
  batch_number: '',
};

/**
 * Add / edit form for a medication (FR 3.1, FR 3.2).
 * Adding one also records its opening stock lot, since quantity and expiry now
 * belong to a batch. Editing covers catalog fields only - stock is changed from
 * the medication's stock lots.
 */
export default function MedicationForm({ initialValue, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const isEdit = Boolean(initialValue);

  useEffect(() => {
    const threshold = String(initialValue?.low_stock_threshold ?? constants.LOW_STOCK_THRESHOLD);
    setForm(
      initialValue
        ? { ...EMPTY, ...initialValue, low_stock_threshold: threshold }
        : { ...EMPTY, low_stock_threshold: threshold }
    );
    setError(null);
    setFieldErrors({});
  }, [initialValue]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const payload = {
      name: form.name,
      category: form.category,
      unit_price: form.unit_price,
      supplier_info: form.supplier_info,
      low_stock_threshold: form.low_stock_threshold,
    };
    if (!isEdit) {
      payload.quantity = form.quantity;
      payload.expiry_date = form.expiry_date;
      payload.batch_number = form.batch_number;
    }

    try {
      await onSubmit(payload);
      if (!isEdit) setForm({ ...EMPTY, low_stock_threshold: String(constants.LOW_STOCK_THRESHOLD) });
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.details || {});
    }
  };

  const field = (name, label, props = {}) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <input name={name} value={form[name]} onChange={handleChange} {...props} />
      {fieldErrors[name] && <span className="field__error">{fieldErrors[name]}</span>}
    </label>
  );

  return (
    <form className="card" onSubmit={handleSubmit} aria-label={isEdit ? 'Edit medication' : 'Add medication'}>
      <h2>{isEdit ? `Edit: ${initialValue.name}` : 'Add medication'}</h2>
      {error && <div className="alert alert--error" role="alert">{error}</div>}

      <div className="form-grid">
        {field('name', 'Medication name', { required: true, maxLength: 150 })}
        {field('category', 'Category', { required: true, maxLength: 100 })}
        {field('unit_price', 'Unit price', { required: true, type: 'number', min: 0, step: '0.01' })}
        {field('supplier_info', 'Supplier information', { required: true, maxLength: 255 })}
        {field('low_stock_threshold', 'Reorder threshold (units)', {
          required: true, type: 'number', min: 0, step: 1,
        })}
      </div>

      {!isEdit && (
        <>
          <h3>Opening stock lot</h3>
          <p className="muted">
            Stock is tracked per lot so each delivery keeps its own expiry date. More lots can be added afterwards.
          </p>
          <div className="form-grid">
            {field('quantity', 'Quantity in stock', { required: true, type: 'number', min: 0, step: 1 })}
            {field('expiry_date', 'Expiry date of this lot', { required: true, type: 'date' })}
            {field('batch_number', 'Lot number (optional)', { maxLength: 60 })}
          </div>
        </>
      )}

      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Saving...' : isEdit ? 'Save changes' : 'Add medication'}
        </button>
        {isEdit && (
          <button type="button" className="btn" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
