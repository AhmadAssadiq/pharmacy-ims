// The staff inventory page (FR 2.1, FR 3, FR 4) - the first page staff see.
//
// It answers "what needs action today?":
//   1. a one-line finding at the top (the most urgent thing),
//   2. four numbers (all / low / expiring / expired) that also work as filters,
//   3. the reorder alerts from the forecast,
//   4. the stock table (with search and filters), where medications can be edited or deleted.
// After every change the list is loaded again, so the warning flags are never out of date.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteMedication, fetchMedications, updateMedication } from '../../api/medications';
import InventoryTable from '../../components/inventory/InventoryTable';
import MedicationForm from '../../components/inventory/MedicationForm';
import ReorderAlertPanel from '../../components/alerts/ReorderAlertPanel';
import StyledText from '../../components/StyledText';
import { useI18n } from '../../i18n/useI18n';
import constants from '../../../../shared/constants.json';

const { NEAR_EXPIRY_DAYS } = constants;

// The four filters. They use the flags the server already worked out, so the numbers at
// the top can never disagree with the table.
const FILTERS = {
  all: () => true,
  low: (medication) => medication.is_low_stock,
  expiring: (medication) => medication.is_near_expiry,
  expired: (medication) => medication.expired_quantity > 0,
};

// The magnifying glass in the search box
function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true" focusable="false">
      <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function StaffInventoryPage() {
  const { t, te } = useI18n();
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(null); // the medication being edited, or null
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState('all');
  const formRef = useRef(null);

  // Loads (or reloads) every medication with its stock and flags
  async function loadMedications() {
    try {
      const data = await fetchMedications();
      setMedications(data.medications);
      setError(null);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMedications();
  }, []);

  // Shows a green message for 6 seconds
  function showNotice(message) {
    setNotice(message);
    setTimeout(() => setNotice(null), 6000);
  }

  // Saves the edit form (errors are shown by the form itself)
  async function handleUpdate(details) {
    setSaving(true);
    try {
      await updateMedication(editing.id, details);
      await loadMedications();
      setEditing(null);
      showNotice(t('inventory.updated'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(medication) {
    if (!window.confirm(t('inventory.confirmDelete', { name: medication.name }))) {
      return;
    }
    try {
      await deleteMedication(medication.id);
      if (editing && editing.id === medication.id) {
        setEditing(null);
      }
      await loadMedications();
      showNotice(t('inventory.deleted', { name: medication.name }));
    } catch (deleteError) {
      setError(deleteError);
    }
  }

  // Opens the edit form below the table and scrolls to it
  function startEditing(medication) {
    setEditing(medication);
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // How many medications match each filter
  const counts = {
    all: medications.length,
    low: medications.filter(FILTERS.low).length,
    expiring: medications.filter(FILTERS.expiring).length,
    expired: medications.filter(FILTERS.expired).length,
  };

  // The rows to show: the chosen filter, then the search text (name, category or supplier)
  const search = searchText.trim().toLowerCase();
  const visibleMedications = medications.filter(FILTERS[filter]).filter((medication) => {
    if (!search) {
      return true;
    }
    return (
      medication.name.toLowerCase().includes(search) ||
      medication.category.toLowerCase().includes(search) ||
      String(medication.supplier_info).toLowerCase().includes(search)
    );
  });

  // The one-line finding at the top: the most urgent thing first (counts shown in bold)
  let finding = null;
  if (!loading && !error) {
    if (counts.expired > 0) {
      finding = <StyledText id="inventory.findingExpired" count={counts.expired} />;
    } else if (counts.low > 0) {
      finding = <StyledText id="inventory.findingLow" count={counts.low} />;
    } else if (counts.expiring > 0) {
      finding = <StyledText id="inventory.findingExpiring" count={counts.expiring} values={{ days: NEAR_EXPIRY_DAYS }} />;
    } else {
      finding = t('inventory.findingClear', { days: NEAR_EXPIRY_DAYS });
    }
  }

  // The four numbers at the top. `tone` greys out a zero, or makes expired stock red.
  const kpis = [
    { key: 'all', label: t('inventory.kpiAll'), value: counts.all, tone: '' },
    { key: 'low', label: t('inventory.kpiLow'), value: counts.low, tone: counts.low ? '' : 'zero' },
    {
      key: 'expiring',
      label: t('inventory.kpiExpiring', { days: NEAR_EXPIRY_DAYS }),
      value: counts.expiring,
      tone: counts.expiring ? '' : 'zero',
    },
    { key: 'expired', label: t('inventory.kpiExpired'), value: counts.expired, tone: counts.expired ? 'alert' : 'zero' },
  ];

  // The filter buttons above the table
  const chips = [
    { key: 'all', label: t('inventory.chipAll') },
    { key: 'low', label: t('inventory.chipLow') },
    { key: 'expiring', label: t('inventory.chipExpiring') },
    { key: 'expired', label: t('inventory.chipExpired') },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t('inventory.title')}</h1>
          {finding && <p className="page-finding">{finding}</p>}
        </div>
        <Link to="/staff/stock" className="btn btn--primary">
          {t('inventory.receiveStock')}
        </Link>
      </div>

      {notice && (
        <div className="alert alert--success" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="alert alert--error" role="alert">
          {te(error)}
        </div>
      )}

      {/* The four numbers - clicking one shows the matching rows in the table */}
      <div className="kpi-strip">
        {kpis.map((kpi) => (
          <button key={kpi.key} type="button" className="kpi" aria-pressed={filter === kpi.key} onClick={() => setFilter(kpi.key)}>
            <span className="kpi__label">{kpi.label}</span>
            {loading ? (
              <span className="skeleton skeleton--kpi" aria-hidden="true" />
            ) : (
              <span className={`kpi__value ${kpi.tone ? `kpi__value--${kpi.tone}` : ''}`}>{kpi.value}</span>
            )}
          </button>
        ))}
      </div>

      <ReorderAlertPanel />

      <div className="card">
        <div className="card__header">
          <h2>{t('inventory.stockOnHand')}</h2>
          <span className="card__note">{t('inventory.stockNote')}</span>
        </div>

        {/* Search box, filter buttons and "x of y shown" */}
        <div className="toolbar">
          <div className="toolbar__search">
            <SearchIcon />
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={t('inventory.searchPlaceholder')}
              aria-label={t('inventory.searchLabel')}
            />
          </div>
          {chips.map((chip) => (
            <button key={chip.key} type="button" className="chip" aria-pressed={filter === chip.key} onClick={() => setFilter(chip.key)}>
              {chip.label}
              <span className="chip__count">{counts[chip.key]}</span>
            </button>
          ))}
          <span className="toolbar__count" aria-live="polite">
            {loading
              ? t('inventory.loadingCount')
              : t('inventory.shown', { shown: visibleMedications.length, total: counts.all })}
          </span>
        </div>

        {loading ? (
          <p className="empty">{t('inventory.loadingInventory')}</p>
        ) : (
          <InventoryTable
            medications={visibleMedications}
            onEdit={startEditing}
            onDelete={handleDelete}
            onBatchesChanged={loadMedications}
          />
        )}
      </div>

      {/* The edit form appears here when "Edit" is clicked in the table */}
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
