import { useEffect, useState } from 'react';
import constants from '../../../../shared/constants.json';
import { useI18n } from '../../i18n/I18nContext';

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
  const { t, te } = useI18n();
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
      setError(te(err));
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
    <form
      className="card"
      onSubmit={handleSubmit}
      aria-label={isEdit ? t('medicationForm.editLabel') : t('medicationForm.addTitle')}
    >
      <h2>{isEdit ? t('medicationForm.editTitle', { name: initialValue.name }) : t('medicationForm.addTitle')}</h2>
      {error && <div className="alert alert--error" role="alert">{error}</div>}

      <div className="form-grid">
        {field('name', t('medicationForm.name'), { required: true, maxLength: 150 })}
        {field('category', t('medicationForm.category'), { required: true, maxLength: 100 })}
        {field('unit_price', t('medicationForm.price'), { required: true, type: 'number', min: 0, step: '0.01' })}
        {field('supplier_info', t('medicationForm.supplier'), { required: true, maxLength: 255 })}
        {field('low_stock_threshold', t('medicationForm.threshold'), {
          required: true, type: 'number', min: 0, step: 1,
        })}
      </div>

      {!isEdit && (
        <>
          <h3>{t('medicationForm.openingLot')}</h3>
          <p className="muted">{t('medicationForm.openingNote')}</p>
          <div className="form-grid">
            {field('quantity', t('medicationForm.quantityInStock'), { required: true, type: 'number', min: 0, step: 1 })}
            {field('expiry_date', t('batch.lotExpiry'), { required: true, type: 'date' })}
            {field('batch_number', t('batch.lotNumberOptional'), { maxLength: 60 })}
          </div>
        </>
      )}

      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? t('common.saving') : isEdit ? t('medicationForm.saveChanges') : t('medicationForm.add')}
        </button>
        {isEdit && (
          <button type="button" className="btn" onClick={onCancel} disabled={submitting}>
            {t('common.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
