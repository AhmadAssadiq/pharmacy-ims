import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteMedication, fetchMedications, updateMedication } from '../../api/medications';
import InventoryTable from '../../components/inventory/InventoryTable';
import MedicationForm from '../../components/inventory/MedicationForm';
import ReorderAlertPanel from '../../components/alerts/ReorderAlertPanel';

/* The filters are bound to the flags the server already computes, so the
   counts in the KPI strip and the chips can never disagree with the table. */
const FILTERS = {
  all: () => true,
  low: (m) => m.is_low_stock,
  expiring: (m) => m.is_near_expiry,
  expired: (m) => m.expired_quantity > 0,
};

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true" focusable="false">
      <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Staff inventory (FR 2.1, FR 3, FR 4).
 *
 * The screen's one question: what needs action today? The KPI strip answers it
 * first, its cells double as the table's filters, and the table below is the
 * evidence. Every change re-fetches, so the flags are never stale.
 */
export default function StaffInventoryPage() {
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const formRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchMedications();
      setMedications(data.medications);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(null), 6000);
  };

  const handleUpdate = async (payload) => {
    setSaving(true);
    try {
      await updateMedication(editing.id, payload);
      await load();
      setEditing(null);
      flash('Medication updated.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (med) => {
    if (!window.confirm(`Delete "${med.name}" from the catalog?`)) return;
    try {
      await deleteMedication(med.id);
      if (editing?.id === med.id) setEditing(null);
      await load();
      flash(`${med.name} deleted from the catalog.`);
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = (med) => {
    setEditing(med);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const counts = useMemo(
    () => ({
      all: medications.length,
      low: medications.filter(FILTERS.low).length,
      expiring: medications.filter(FILTERS.expiring).length,
      expired: medications.filter(FILTERS.expired).length,
    }),
    [medications]
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return medications.filter(FILTERS[filter]).filter((m) => {
      if (!term) return true;
      return (
        m.name.toLowerCase().includes(term) ||
        m.category.toLowerCase().includes(term) ||
        String(m.supplier_info).toLowerCase().includes(term)
      );
    });
  }, [medications, query, filter]);

  /* The screen's one finding: the most urgent thing in today's data. */
  const finding = (() => {
    if (loading || error) return null;
    if (counts.expired > 0) {
      return (
        <>
          <strong>{counts.expired}</strong>{' '}
          {counts.expired === 1 ? 'medication is' : 'medications are'} holding expired stock that
          cannot be dispensed.
        </>
      );
    }
    if (counts.low > 0) {
      return (
        <>
          <strong>{counts.low}</strong> {counts.low === 1 ? 'medication is' : 'medications are'}{' '}
          at or below its reorder level.
        </>
      );
    }
    if (counts.expiring > 0) {
      return (
        <>
          <strong>{counts.expiring}</strong> {counts.expiring === 1 ? 'lot expires' : 'lots expire'}{' '}
          within 30 days. Nothing is below its reorder level.
        </>
      );
    }
    return <>Every medication is above its reorder level with no lot expiring within 30 days.</>;
  })();

  const kpis = [
    { key: 'all', label: 'Medications', value: counts.all, tone: '' },
    { key: 'low', label: 'At or below reorder level', value: counts.low, tone: counts.low ? '' : 'zero' },
    {
      key: 'expiring',
      label: 'Lots expiring within 30 days',
      value: counts.expiring,
      tone: counts.expiring ? '' : 'zero',
    },
    {
      key: 'expired',
      label: 'Holding expired stock',
      value: counts.expired,
      tone: counts.expired ? 'alert' : 'zero',
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Inventory</h1>
          {finding && <p className="page-finding">{finding}</p>}
        </div>
        <Link to="/staff/stock" className="btn btn--primary">
          Receive stock
        </Link>
      </div>

      {notice && (
        <div className="alert alert--success" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}

      {/* KPIs double as the table's filters: one click shows the rows behind a number. */}
      <div className="kpi-strip">
        {kpis.map((kpi) => (
          <button
            key={kpi.key}
            type="button"
            className="kpi"
            aria-pressed={filter === kpi.key}
            onClick={() => setFilter(kpi.key)}
          >
            <span className="kpi__label">{kpi.label}</span>
            {loading ? (
              <span className="skeleton skeleton--kpi" aria-hidden="true" />
            ) : (
              <span className={`kpi__value ${kpi.tone ? `kpi__value--${kpi.tone}` : ''}`}>
                {kpi.value}
              </span>
            )}
          </button>
        ))}
      </div>

      <ReorderAlertPanel onReceiveStock={() => {}} />

      <div className="card">
        <div className="card__header">
          <h2>Stock on hand</h2>
          <span className="card__note">
            Quantities exclude expired lots, which cannot be dispensed.
          </span>
        </div>

        <div className="toolbar">
          <div className="toolbar__search">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, category or supplier"
              aria-label="Search medications"
            />
          </div>
          {[
            { key: 'all', label: 'All' },
            { key: 'low', label: 'Low stock' },
            { key: 'expiring', label: 'Expiring' },
            { key: 'expired', label: 'Expired' },
          ].map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="chip"
              aria-pressed={filter === chip.key}
              onClick={() => setFilter(chip.key)}
            >
              {chip.label}
              <span className="chip__count">{counts[chip.key]}</span>
            </button>
          ))}
          <span className="toolbar__count" aria-live="polite">
            {loading ? 'Loading' : `${visible.length} of ${counts.all} shown`}
          </span>
        </div>

        {loading ? (
          <p className="empty">Loading inventory...</p>
        ) : (
          <InventoryTable
            medications={visible}
            onEdit={startEdit}
            onDelete={handleDelete}
            onBatchesChanged={load}
          />
        )}
      </div>

      <div ref={formRef} style={{ scrollMarginTop: 24 }}>
        {editing && (
          <MedicationForm
            key={editing.id}
            initialValue={editing}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
            submitting={saving}
          />
        )}
      </div>
    </>
  );
}
