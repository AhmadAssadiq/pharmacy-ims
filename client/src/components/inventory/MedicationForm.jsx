import { useEffect, useState } from 'react';

const EMPTY = { name: '', category: '', quantity: '', unit_price: '', expiry_date: '', supplier_info: '' };

/**
 * Add / edit form for a medication (FR 3.1, FR 3.2). All six fields from the
 * specification are shown with plain labels so no training is needed (NFR 3.1).
 */
export default function MedicationForm({ initialValue, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const isEdit = Boolean(initialValue);

  useEffect(() => {
    setForm(initialValue ? { ...EMPTY, ...initialValue, expiry_date: String(initialValue.expiry_date).slice(0, 10) } : EMPTY);
    setError(null);
    setFieldErrors({});
  }, [initialValue]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    try {
      await onSubmit({
        name: form.name,
        category: form.category,
        quantity: form.quantity,
        unit_price: form.unit_price,
        expiry_date: form.expiry_date,
        supplier_info: form.supplier_info,
      });
      if (!isEdit) setForm(EMPTY);
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.details || {});
    }
  };

  const field = (name, label, props = {}) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <input name={name} value={form[name]} onChange={handleChange} required {...props} />
      {fieldErrors[name] && <span className="field__error">{fieldErrors[name]}</span>}
    </label>
  );

  return (
    <form className="card" onSubmit={handleSubmit} aria-label={isEdit ? 'Edit medication' : 'Add medication'}>
      <h2>{isEdit ? `Edit: ${initialValue.name}` : 'Add medication'}</h2>
      {error && <div className="alert alert--error" role="alert">{error}</div>}

      <div className="form-grid">
        {field('name', 'Medication name', { maxLength: 150 })}
        {field('category', 'Category', { maxLength: 100 })}
        {field('quantity', 'Quantity in stock', { type: 'number', min: 0, step: 1 })}
        {field('unit_price', 'Unit price', { type: 'number', min: 0, step: '0.01' })}
        {field('expiry_date', 'Expiry date', { type: 'date' })}
        {field('supplier_info', 'Supplier information', { maxLength: 255 })}
      </div>

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
