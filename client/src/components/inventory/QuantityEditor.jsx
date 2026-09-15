import { useState } from 'react';

/**
 * Inline stock update used in the inventory table (UC-1): the staff member
 * enters a new quantity and saves; invalid values are rejected by the server
 * and shown here without changing the stored quantity.
 */
export default function QuantityEditor({ medication, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(medication.quantity));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const start = () => {
    setValue(String(medication.quantity));
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(medication.id, value);
      setEditing(false);
    } catch (err) {
      setError(err.details?.quantity || err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <span className="qty">
        <strong>{medication.quantity}</strong>{' '}
        <button type="button" className="btn btn--sm" onClick={start} aria-label={`Update quantity of ${medication.name}`}>
          Update
        </button>
      </span>
    );
  }

  return (
    <form className="qty qty--editing" onSubmit={save}>
      <input
        type="number"
        step={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`New quantity for ${medication.name}`}
        autoFocus
        style={{ width: '6rem' }}
      />
      <button type="submit" className="btn btn--sm btn--primary" disabled={saving}>Save</button>
      <button type="button" className="btn btn--sm" onClick={cancel} disabled={saving}>Cancel</button>
      {error && <span className="field__error">{error}</span>}
    </form>
  );
}
