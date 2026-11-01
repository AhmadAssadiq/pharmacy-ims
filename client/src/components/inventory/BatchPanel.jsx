// The stock lots of one medication (UC-1), shown under its row in the inventory table.
// Each delivery is its own lot with its own expiry date. Staff can:
//   - receive a delivery (add a lot),
//   - correct a lot (for example after a miscount),
//   - remove a lot.
// Selling always takes units from the lot that expires first.
import { useEffect, useState } from 'react';
import { createBatch, deleteBatch, fetchBatches, updateBatch } from '../../api/medications';
import { expiryStatus } from '../../utils/expiry';
import { useI18n } from '../../i18n/useI18n';

const EMPTY_LOT = { quantity: '', expiry_date: '', batch_number: '' };

// Turns a lot from the server into form values (a date input needs plain YYYY-MM-DD)
function lotToForm(batch) {
  return {
    quantity: String(batch.quantity),
    expiry_date: String(batch.expiry_date).slice(0, 10),
    batch_number: batch.batch_number || '',
  };
}

// medication: the medication whose lots are shown
// onChanged: called after a change, so the inventory page can reload its totals
export default function BatchPanel({ medication, onChanged }) {
  const { t, te, formatDate } = useI18n();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [newLot, setNewLot] = useState(EMPTY_LOT); // the "receive a delivery" form
  const [editingId, setEditingId] = useState(null); // the lot being corrected, or null
  const [editedLot, setEditedLot] = useState(EMPTY_LOT); // the "correct a lot" form
  const [saving, setSaving] = useState(false);

  // Loads (or reloads) this medication's lots
  async function loadBatches() {
    try {
      const data = await fetchBatches(medication.id);
      setBatches(data.batches);
      setError(null);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medication.id]);

  // Runs a change (add / correct / remove), then reloads. Returns true when it worked.
  async function saveChange(change) {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      await change();
      await loadBatches();
      if (onChanged) {
        onChanged();
      }
      return true;
    } catch (saveError) {
      setError(saveError);
      setFieldErrors(saveError.details || {});
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd(event) {
    event.preventDefault();
    const worked = await saveChange(() => createBatch(medication.id, newLot));
    if (worked) {
      setNewLot(EMPTY_LOT);
    }
  }

  async function handleSaveEdit(event) {
    event.preventDefault();
    const worked = await saveChange(() => updateBatch(editingId, editedLot));
    if (worked) {
      setEditingId(null);
    }
  }

  async function handleDelete(batch) {
    const question = t('batch.confirmRemove', { quantity: batch.quantity, date: formatDate(batch.expiry_date) });
    if (window.confirm(question)) {
      await saveChange(() => deleteBatch(batch.id));
    }
  }

  function startEditing(batch) {
    setEditingId(batch.id);
    setEditedLot(lotToForm(batch));
    setFieldErrors({});
  }

  // The badge text for a lot: "Expired 3 days ago", "Expires in 12 days" or "OK"
  function statusLabel(status) {
    if (status.kind === 'expired') return t('status.expiredAgo', { count: Math.abs(status.days) });
    if (status.kind === 'soon') return t('status.expiresIn', { count: status.days });
    return t('status.ok');
  }

  // One labelled input of a lot form. `lot` / `setLot` are that form's values and setter.
  function lotField(lot, setLot, name, label, inputProps) {
    return (
      <label className="field">
        <span className="field__label">{label}</span>
        <input name={name} value={lot[name]} onChange={(event) => setLot({ ...lot, [name]: event.target.value })} {...inputProps} />
        {fieldErrors[name] && <span className="field__error">{fieldErrors[name]}</span>}
      </label>
    );
  }

  if (loading) {
    return <p className="empty">{t('batch.loading')}</p>;
  }

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

              // The lot being corrected is shown as a small form instead of a row
              if (editingId === batch.id) {
                return (
                  <tr key={batch.id}>
                    <td colSpan={6}>
                      <form className="batch-panel__form" onSubmit={handleSaveEdit}>
                        {lotField(editedLot, setEditedLot, 'expiry_date', t('batch.colExpiry'), { type: 'date', required: true })}
                        {lotField(editedLot, setEditedLot, 'quantity', t('common.quantity'), { type: 'number', min: 0, step: 1, required: true })}
                        {lotField(editedLot, setEditedLot, 'batch_number', t('batch.colLot'), { maxLength: 60 })}
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
                    <button type="button" className="btn btn--sm" onClick={() => startEditing(batch)}>
                      {t('common.edit')}
                    </button>{' '}
                    <button type="button" className="btn btn--sm btn--danger" onClick={() => handleDelete(batch)} disabled={saving}>
                      {t('common.remove')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Receive a delivery: adds a new lot */}
      <form className="batch-panel__form" onSubmit={handleAdd} aria-label={t('batch.receiveTitle')}>
        <h4>{t('batch.receiveTitle')}</h4>
        <div className="form-grid">
          {lotField(newLot, setNewLot, 'quantity', t('batch.quantityReceived'), { type: 'number', min: 0, step: 1, required: true })}
          {lotField(newLot, setNewLot, 'expiry_date', t('batch.lotExpiry'), { type: 'date', required: true })}
          {lotField(newLot, setNewLot, 'batch_number', t('batch.lotNumberOptional'), { maxLength: 60 })}
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
