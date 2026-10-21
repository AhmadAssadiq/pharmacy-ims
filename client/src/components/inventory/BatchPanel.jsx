import { useCallback, useEffect, useState } from 'react';
import { createBatch, deleteBatch, fetchBatches, updateBatch } from '../../api/medications';
import { expiryStatus } from '../../utils/expiry';
import { useI18n } from '../../i18n/I18nContext';

const EMPTY = { quantity: '', expiry_date: '', batch_number: '' };

function toForm(batch) {
  return {
    quantity: String(batch.quantity),
    // A date input only accepts YYYY-MM-DD, never the display format.
    expiry_date: String(batch.expiry_date).slice(0, 10),
    batch_number: batch.batch_number || '',
  };
}

/**
 * Stock lots for one medication (UC-1). Receiving a delivery adds a lot with its
 * own expiry date; dispensing always draws from the lot expiring soonest.
 */
export default function BatchPanel({ medication, onChanged }) {
  const { t, te, formatDate } = useI18n();
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
      setError(err);
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
      setError(err);
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
    const message = t('batch.confirmRemove', { quantity: batch.quantity, date: formatDate(batch.expiry_date) });
    if (!window.confirm(message)) return;
    await run(() => deleteBatch(batch.id));
  };

  const startEdit = (batch) => {
    setEditingId(batch.id);
    setEditForm(toForm(batch));
    setFieldErrors({});
  };

  const statusLabel = (status) =>
    status.kind === 'expired'
      ? t('status.expiredAgo', { count: Math.abs(status.days) })
      : status.kind === 'soon'
        ? t('status.expiresIn', { count: status.days })
        : t('status.ok');

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

  if (loading) return <p className="empty">{t('batch.loading')}</p>;

  return (
    <div className="batch-panel">
      <h3>{t('batch.title')}</h3>
      {error && <div className="alert alert--error" role="alert">{te(error)}</div>}

      {batches.length === 0 ? (
        <p className="empty">{t('batch.empty')}</p>
      ) : (
        <table className="table table--compact">
          <caption className="sr-only">{t('batch.caption', { name: medication.name })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('batch.colExpiry')}</th>
              <th scope="col" className="num">{t('common.quantity')}</th>
              <th scope="col">{t('batch.colLot')}</th>
              <th scope="col">{t('batch.colReceived')}</th>
              <th scope="col">{t('common.status')}</th>
              <th scope="col" className="actions">{t('common.actions')}</th>
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
                        {batchField(editForm, setEditForm, 'expiry_date', t('batch.colExpiry'), { type: 'date', required: true })}
                        {batchField(editForm, setEditForm, 'quantity', t('common.quantity'), {
                          type: 'number', min: 0, step: 1, required: true,
                        })}
                        {batchField(editForm, setEditForm, 'batch_number', t('batch.colLot'), { maxLength: 60 })}
                        <div className="form-actions">
                          <button type="submit" className="btn btn--sm btn--primary" disabled={saving}>
                            {saving ? t('common.saving') : t('batch.save')}
                          </button>{' '}
                          <button type="button" className="btn btn--sm" onClick={() => setEditingId(null)}>
                            {t('common.cancel')}
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={batch.id} className={status.modifier === 'danger' ? 'is-flagged' : undefined}>
                  <td className="date">{formatDate(batch.expiry_date)}</td>
                  <td className="num">{batch.quantity}</td>
                  <td><bdi>{batch.batch_number || '—'}</bdi></td>
                  <td className="date">{formatDate(batch.received_date)}</td>
                  <td><span className={`badge badge--${status.modifier}`}>{statusLabel(status)}</span></td>
                  <td className="actions">
                    <button type="button" className="btn btn--sm" onClick={() => startEdit(batch)}>
                      {t('common.edit')}
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn--sm btn--danger"
                      onClick={() => handleDelete(batch)}
                      disabled={saving}
                    >
                      {t('common.remove')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <form className="batch-panel__form" onSubmit={handleAdd} aria-label={t('batch.receiveTitle')}>
        <h4>{t('batch.receiveTitle')}</h4>
        <div className="form-grid">
          {batchField(form, setForm, 'quantity', t('batch.quantityReceived'), {
            type: 'number', min: 0, step: 1, required: true,
          })}
          {batchField(form, setForm, 'expiry_date', t('batch.lotExpiry'), { type: 'date', required: true })}
          {batchField(form, setForm, 'batch_number', t('batch.lotNumberOptional'), { maxLength: 60 })}
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? t('common.saving') : t('batch.add')}
          </button>
        </div>
      </form>
    </div>
  );
}
