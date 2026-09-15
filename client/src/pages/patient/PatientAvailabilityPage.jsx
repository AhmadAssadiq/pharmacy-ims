import { useEffect, useMemo, useState } from 'react';
import { fetchAvailability } from '../../api/availability';

/**
 * Patient medication availability view (FR 7, FR 2.2). Shows only whether a
 * medication is in stock - never the exact quantity.
 */
export default function PatientAvailabilityPage() {
  const [medications, setMedications] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAvailability()
      .then((data) => setMedications(data.medications))
      .catch((err) => setError(err.message))
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
        <h1>Medication availability</h1>
      </div>

      <div className="card">
        <label className="field">
          <span className="field__label">Find a medication</span>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search by name or category"
          />
        </label>

        {error && <div className="alert alert--error" role="alert">{error}</div>}
        {loading && <p className="muted">Loading...</p>}
        {!loading && visible.length === 0 && <p className="empty">No medications match your search.</p>}

        <ul className="list">
          {visible.map((m) => (
            <li key={m.id} className="list__item">
              <span>
                <strong>{m.name}</strong>
                <br />
                <span className="muted" style={{ fontSize: '0.85rem' }}>{m.category}</span>
              </span>
              <span className={`badge ${m.in_stock ? 'badge--success' : 'badge--danger'}`}>
                {m.in_stock ? 'In stock' : 'Out of stock'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
