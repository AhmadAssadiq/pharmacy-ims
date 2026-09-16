import { useCallback, useEffect, useState } from 'react';
import { createMedication, fetchMedications } from '../../api/medications';
import MedicationForm from '../../components/inventory/MedicationForm';
import BatchPanel from '../../components/inventory/BatchPanel';
import { formatDate } from '../../utils/expiry';

const NEW_MEDICATION = 'new';

/**
 * Stock intake (FR 3.1, UC-1). One page for putting stock on the shelf: either
 * receive another lot of a medication the pharmacy already carries, or add a
 * medication the catalog does not have yet together with its first lot.
 */
export default function StaffStockPage() {
  const [medications, setMedications] = useState([]);
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    const data = await fetchMedications();
    setMedications(data.medications);
    return data.medications;
  }, []);

  useEffect(() => {
    load()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [load]);

  const flash = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(null), 4000);
  };

  const selected = medications.find((m) => String(m.id) === String(target));

  const handleCreate = async (payload) => {
    setSaving(true);
    try {
      const data = await createMedication(payload);
      await load();
      // Jump to the medication just created so more lots can be added to it.
      setTarget(String(data.medication.id));
      flash(`Added ${data.medication.name} to the catalog with its first stock lot.`);
    } finally {
      setSaving(false);
    }
  };

  const handleBatchesChanged = async () => {
    await load();
    flash('Stock lots updated.');
  };

  return (
    <>
      <div className="page-header">
        <h1>Add stock</h1>
        <div className="status-line">Receive a new lot, or add a medication the catalog does not carry yet</div>
      </div>

      {notice && <div className="alert alert--success" role="status">{notice}</div>}
      {error && <div className="alert alert--error" role="alert">{error}</div>}

      <div className="card">
        <h2>What are you stocking?</h2>
        {loading ? (
          <p className="muted">Loading catalog...</p>
        ) : (
          <label className="field">
            <span className="field__label">Medication</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Select...</option>
              <option value={NEW_MEDICATION}>+ New medication (not in the catalog yet)</option>
              <optgroup label="Already in the catalog">
                {medications.map((med) => (
                  <option key={med.id} value={med.id}>
                    {med.name} — {med.quantity} in stock
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        )}
      </div>

      {target === NEW_MEDICATION && (
        <MedicationForm onSubmit={handleCreate} submitting={saving} />
      )}

      {selected && (
        <>
          <div className="card">
            <h2>{selected.name}</h2>
            <div className="stock-summary">
              <div>
                <span className="field__label">In stock</span>
                <strong>{selected.quantity}</strong>
              </div>
              <div>
                <span className="field__label">Reorder at</span>
                <strong>{selected.low_stock_threshold}</strong>
              </div>
              <div>
                <span className="field__label">Next expiry</span>
                <strong>{formatDate(selected.expiry_date)}</strong>
              </div>
              {selected.expired_quantity > 0 && (
                <div>
                  <span className="field__label">Expired units</span>
                  <strong className="text-danger">{selected.expired_quantity}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <BatchPanel medication={selected} onChanged={handleBatchesChanged} />
          </div>
        </>
      )}
    </>
  );
}
