import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createMedication, fetchMedications } from '../../api/medications';
import MedicationForm from '../../components/inventory/MedicationForm';
import BatchPanel from '../../components/inventory/BatchPanel';
import { useI18n } from '../../i18n/I18nContext';

const NEW_MEDICATION = 'new';

/**
 * Stock intake (FR 3.1, UC-1). One page for putting stock on the shelf: either
 * receive another lot of a medication the pharmacy already carries, or add a
 * medication the catalog does not have yet together with its first lot.
 *
 * The selection lives in the query string (`?medication=<id>`), so a reorder
 * alert's "Receive stock" link opens the page with that medication chosen.
 */
export default function StaffStockPage() {
  const { t, te, formatDate } = useI18n();
  const [medications, setMedications] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
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
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [load]);

  const flash = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(null), 4000);
  };

  const target = searchParams.get('medication') ?? '';
  const setTarget = (value) =>
    setSearchParams(value ? { medication: value } : {}, { replace: true });

  const selected = medications.find((m) => String(m.id) === String(target));

  const handleCreate = async (payload) => {
    setSaving(true);
    try {
      const data = await createMedication(payload);
      await load();
      // Jump to the medication just created so more lots can be added to it.
      setTarget(String(data.medication.id));
      flash(t('stock.added', { name: data.medication.name }));
    } finally {
      setSaving(false);
    }
  };

  const handleBatchesChanged = async () => {
    await load();
    flash(t('stock.lotsUpdated'));
  };

  return (
    <>
      <div className="page-header">
        <h1>{t('stock.title')}</h1>
        <div className="status-line">{t('stock.subtitle')}</div>
      </div>

      {notice && <div className="alert alert--success" role="status">{notice}</div>}
      {error && <div className="alert alert--error" role="alert">{te(error)}</div>}

      <div className="card">
        <h2>{t('stock.question')}</h2>
        {loading ? (
          <p className="muted">{t('common.loadingCatalog')}</p>
        ) : (
          <label className="field">
            <span className="field__label">{t('common.medication')}</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">{t('stock.select')}</option>
              <option value={NEW_MEDICATION}>{t('stock.newOption')}</option>
              <optgroup label={t('stock.inCatalog')}>
                {medications.map((med) => (
                  <option key={med.id} value={med.id}>
                    {t('stock.option', { name: med.name, quantity: med.quantity })}
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
            <h2><bdi>{selected.name}</bdi></h2>
            <div className="stock-summary">
              <div>
                <span className="field__label">{t('common.inStock')}</span>
                <strong>{selected.quantity}</strong>
              </div>
              <div>
                <span className="field__label">{t('common.reorderAt')}</span>
                <strong>{selected.low_stock_threshold}</strong>
              </div>
              <div>
                <span className="field__label">{t('common.nextExpiry')}</span>
                <strong>{formatDate(selected.expiry_date)}</strong>
              </div>
              {selected.expired_quantity > 0 && (
                <div>
                  <span className="field__label">{t('stock.expiredUnits')}</span>
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
