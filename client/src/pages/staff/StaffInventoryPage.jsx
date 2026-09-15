import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createMedication,
  deleteMedication,
  fetchMedications,
  updateMedication,
  updateMedicationQuantity,
} from '../../api/medications';
import InventoryTable from '../../components/inventory/InventoryTable';
import MedicationForm from '../../components/inventory/MedicationForm';
import ReorderAlertPanel from '../../components/alerts/ReorderAlertPanel';

/**
 * Staff inventory dashboard (FR 2.1, FR 3, FR 4).
 * Every change re-fetches the catalog so the table always shows the current
 * stock levels and flags.
 */
export default function StaffInventoryPage() {
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
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
    setTimeout(() => setNotice(null), 3000);
  };

  const handleCreate = async (payload) => {
    setSaving(true);
    try {
      await createMedication(payload);
      await load();
      flash('Medication added.');
    } finally {
      setSaving(false);
    }
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

  const handleUpdateQuantity = async (id, quantity) => {
    await updateMedicationQuantity(id, quantity);
    await load();
    flash('Stock quantity updated.');
  };

  const handleDelete = async (med) => {
    if (!window.confirm(`Delete "${med.name}" from the catalog?`)) return;
    try {
      await deleteMedication(med.id);
      if (editing?.id === med.id) setEditing(null);
      await load();
      flash('Medication deleted.');
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = (med) => {
    setEditing(med);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const lowStock = medications.filter((m) => m.is_low_stock).length;
  const nearExpiry = medications.filter((m) => m.is_near_expiry).length;

  return (
    <>
      <div className="page-header">
        <h1>Inventory dashboard</h1>
        <div className="status-line">
          {medications.length} medications · {lowStock} low stock · {nearExpiry} expiring within 30 days
        </div>
      </div>

      {notice && <div className="alert alert--success" role="status">{notice}</div>}
      {error && <div className="alert alert--error" role="alert">{error}</div>}

      <ReorderAlertPanel />

      <div className="card">
        <h2>Current stock</h2>
        {loading ? (
          <p className="muted">Loading inventory...</p>
        ) : (
          <InventoryTable
            medications={medications}
            onEdit={startEdit}
            onDelete={handleDelete}
            onUpdateQuantity={handleUpdateQuantity}
          />
        )}
      </div>

      <div ref={formRef}>
        <MedicationForm
          key={editing ? editing.id : 'new'}
          initialValue={editing}
          onSubmit={editing ? handleUpdate : handleCreate}
          onCancel={() => setEditing(null)}
          submitting={saving}
        />
      </div>
    </>
  );
}
