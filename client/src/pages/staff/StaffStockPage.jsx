// The "Add stock" page (FR 3.1, UC-1): one place to put stock on the shelf. Staff either
//   - choose a medication the pharmacy already has, and receive another lot of it, or
//   - choose "new medication", and add it to the catalogue with its first lot.
// The chosen medication is kept in the address (?medication=12), so the "Receive stock"
// button of a reorder alert opens this page with that medication already chosen.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createMedication, fetchMedications } from '../../api/medications';
import MedicationForm from '../../components/inventory/MedicationForm';
import BatchPanel from '../../components/inventory/BatchPanel';
import { useI18n } from '../../i18n/useI18n';

// The drop-down value meaning "a medication we do not have yet"
const NEW_MEDICATION = 'new';

export default function StaffStockPage() {
  const { t, te, formatDate } = useI18n();
  const [medications, setMedications] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Loads (or reloads) the medication list for the drop-down
  async function loadMedications() {
    const data = await fetchMedications();
    setMedications(data.medications);
  }

  useEffect(() => {
    loadMedications()
      .catch((loadError) => setError(loadError))
      .finally(() => setLoading(false));
  }, []);

  // Shows a green message for 4 seconds
  function showNotice(message) {
    setNotice(message);
    setTimeout(() => setNotice(null), 4000);
  }

  // The choice in the drop-down, read from and saved to the address (?medication=...)
  const choice = searchParams.get('medication') ?? '';
  function changeChoice(value) {
    setSearchParams(value ? { medication: value } : {}, { replace: true });
  }

  const chosenMedication = medications.find((medication) => String(medication.id) === String(choice));

  // Adds a new medication with its first lot (the form shows any errors itself)
  async function handleCreate(details) {
    setSaving(true);
    try {
      const data = await createMedication(details);
      await loadMedications();
      // Switch to the new medication, so more lots can be added to it straight away
      changeChoice(String(data.medication.id));
      showNotice(t('stock.added', { name: data.medication.name }));
    } finally {
      setSaving(false);
    }
  }

  // After a lot is added, corrected or removed: refresh the totals
  async function handleLotsChanged() {
    await loadMedications();
    showNotice(t('stock.lotsUpdated'));
  }

  return (
    <>
      <div className="page-header">
        <h1>{t('stock.title')}</h1>
        <div className="status-line">{t('stock.subtitle')}</div>
      </div>

      {notice && <div className="alert alert--success" role="status">{notice}</div>}
      {error && <div className="alert alert--error" role="alert">{te(error)}</div>}

      {/* Step 1: which medication? */}
      <div className="card">
        <h2>{t('stock.question')}</h2>
        {loading ? (
          <p className="muted">{t('common.loadingCatalog')}</p>
        ) : (
          <label className="field">
            <span className="field__label">{t('common.medication')}</span>
            <select value={choice} onChange={(event) => changeChoice(event.target.value)}>
              <option value="">{t('stock.select')}</option>
              <option value={NEW_MEDICATION}>{t('stock.newOption')}</option>
              <optgroup label={t('stock.inCatalog')}>
                {medications.map((medication) => (
                  <option key={medication.id} value={medication.id}>
                    {t('stock.option', { name: medication.name, quantity: medication.quantity })}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        )}
      </div>

      {/* Step 2a: a new medication */}
      {choice === NEW_MEDICATION && <MedicationForm onSubmit={handleCreate} submitting={saving} />}

      {/* Step 2b: an existing medication - its current stock, then its lots */}
      {chosenMedication && (
        <>
          <div className="card">
            <h2><bdi>{chosenMedication.name}</bdi></h2>
            <div className="stock-summary">
              <div>
                <span className="field__label">{t('common.inStock')}</span>
                <strong>{chosenMedication.quantity}</strong>
              </div>
              <div>
                <span className="field__label">{t('common.reorderAt')}</span>
                <strong>{chosenMedication.low_stock_threshold}</strong>
              </div>
              <div>
                <span className="field__label">{t('common.nextExpiry')}</span>
                <strong>{formatDate(chosenMedication.expiry_date)}</strong>
              </div>
              {chosenMedication.expired_quantity > 0 && (
                <div>
                  <span className="field__label">{t('stock.expiredUnits')}</span>
                  <strong className="text-danger">{chosenMedication.expired_quantity}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <BatchPanel medication={chosenMedication} onChanged={handleLotsChanged} />
          </div>
        </>
      )}
    </>
  );
}
