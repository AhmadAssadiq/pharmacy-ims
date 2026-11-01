// The add / edit medication form (FR 3.1, FR 3.2).
// - Adding a medication also records its first stock lot (quantity + expiry date), because
//   stock is kept per lot.
// - Editing changes only the catalogue details; stock is changed in the medication's lots.
// If the server finds a problem, its message is shown next to the matching field.
import { useState } from 'react';
import constants from '../../../../shared/constants.json';
import { useI18n } from '../../i18n/useI18n';

// An empty form (the reorder threshold starts at the shared default, 10)
const EMPTY_FORM = {
  name: '',
  category: '',
  unit_price: '',
  supplier_info: '',
  low_stock_threshold: String(constants.LOW_STOCK_THRESHOLD),
  quantity: '',
  expiry_date: '',
  batch_number: '',
};

// initialValue: the medication to edit, or nothing to add a new one
// onSubmit(details): saves the form; throws an ApiError when the server refuses it
export default function MedicationForm({ initialValue, onSubmit, onCancel, submitting }) {
  const { t, te } = useI18n();
  const isEditing = Boolean(initialValue);

  // The form starts with the medication's current values when editing.
  // (The page gives each medication its own form with key={id}, so this runs once per medication.)
  const [form, setForm] = useState(() => {
    if (!initialValue) {
      return EMPTY_FORM;
    }
    return {
      ...EMPTY_FORM,
      ...initialValue,
      low_stock_threshold: String(initialValue.low_stock_threshold ?? constants.LOW_STOCK_THRESHOLD),
    };
  });
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Updates one field as the user types (the input's `name` says which)
  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    // The catalogue details, plus the first stock lot when adding
    const details = {
      name: form.name,
      category: form.category,
      unit_price: form.unit_price,
      supplier_info: form.supplier_info,
      low_stock_threshold: form.low_stock_threshold,
    };
    if (!isEditing) {
      details.quantity = form.quantity;
      details.expiry_date = form.expiry_date;
      details.batch_number = form.batch_number;
    }

    try {
      await onSubmit(details);
      // After adding, empty the form for the next medication
      if (!isEditing) {
        setForm(EMPTY_FORM);
      }
    } catch (submitError) {
      setError(te(submitError));
      setFieldErrors(submitError.details || {});
    }
  }

  // One labelled input with its error message underneath
  function field(name, label, inputProps) {
    return (
      <label className="field">
        <span className="field__label">{label}</span>
        <input name={name} value={form[name]} onChange={handleChange} {...inputProps} />
        {fieldErrors[name] && <span className="field__error">{fieldErrors[name]}</span>}
      </label>
    );
  }

  let submitLabel = t('medicationForm.add');
  if (submitting) submitLabel = t('common.saving');
  else if (isEditing) submitLabel = t('medicationForm.saveChanges');

  return (
    <form className="card" onSubmit={handleSubmit} aria-label={isEditing ? t('medicationForm.editLabel') : t('medicationForm.addTitle')}>
      <h2>{isEditing ? t('medicationForm.editTitle', { name: initialValue.name }) : t('medicationForm.addTitle')}</h2>
      {error && <div className="alert alert--error" role="alert">{error}</div>}

      <div className="form-grid">
        {field('name', t('medicationForm.name'), { required: true, maxLength: 150 })}
        {field('category', t('medicationForm.category'), { required: true, maxLength: 100 })}
        {field('unit_price', t('medicationForm.price'), { required: true, type: 'number', min: 0, step: '0.01' })}
        {field('supplier_info', t('medicationForm.supplier'), { required: true, maxLength: 255 })}
        {field('low_stock_threshold', t('medicationForm.threshold'), { required: true, type: 'number', min: 0, step: 1 })}
      </div>

      {/* Only when adding: the first stock lot */}
      {!isEditing && (
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
          {submitLabel}
        </button>
        {isEditing && (
          <button type="button" className="btn" onClick={onCancel} disabled={submitting}>
            {t('common.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
