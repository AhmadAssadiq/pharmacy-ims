import { useEffect, useMemo, useState } from 'react';
import { fetchAvailability } from '../../api/availability';
import { useI18n } from '../../i18n/I18nContext';

/**
 * Patient medication availability view (FR 7, FR 2.2). Shows only whether a
 * medication is in stock - never the exact quantity.
 */
export default function PatientAvailabilityPage() {
  const { t, te } = useI18n();
  const [medications, setMedications] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAvailability()
      .then((data) => setMedications(data.medications))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return medications;
    return medications.filter(
      (m) => m.name.toLowerCase().includes(term) || m.category.toLowerCase().includes(term)
    );
  }, [medications, filter]);

  return (
    <>
      <div className="page-header">
        <h1>{t('availability.title')}</h1>
      </div>

      <div className="card">
        <label className="field">
          <span className="field__label">{t('availability.find')}</span>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('availability.placeholder')}
          />
        </label>

        {error && <div className="alert alert--error" role="alert">{te(error)}</div>}
        {loading && <p className="muted">{t('common.loading')}</p>}
        {!loading && visible.length === 0 && <p className="empty">{t('availability.none')}</p>}

        <ul className="list">
          {visible.map((m) => (
            <li key={m.id} className="list__item">
              <span>
                <strong><bdi>{m.name}</bdi></strong>
                <br />
                <span className="muted" style={{ fontSize: '0.85rem' }}><bdi>{m.category}</bdi></span>
              </span>
              <span className={`badge ${m.in_stock ? 'badge--success' : 'badge--danger'}`}>
                {m.in_stock ? t('availability.inStock') : t('availability.outOfStock')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
