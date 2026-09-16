import { Fragment, useState } from 'react';
import BatchPanel from './BatchPanel';
import { formatDate } from '../../utils/expiry';

function StatusBadges({ medication }) {
  const badges = [];
  if (medication.is_out_of_stock) badges.push(<span key="out" className="badge badge--danger">Out of stock</span>);
  else if (medication.is_low_stock) badges.push(<span key="low" className="badge badge--warning">Low stock</span>);

  if (medication.is_near_expiry) {
    badges.push(
      <span key="near" className="badge badge--warning">
        Next lot expires in {medication.days_until_expiry} d
      </span>
    );
  }
  if (medication.expired_quantity > 0) {
    badges.push(
      <span key="expired" className="badge badge--danger">{medication.expired_quantity} expired</span>
    );
  }
  if (badges.length === 0) badges.push(<span key="ok" className="badge badge--success">OK</span>);
  return <span className="badges">{badges}</span>;
}

/**
 * Inventory list with sellable stock levels, per-medication reorder thresholds
 * and expiry flags (FR 4). Stock itself is managed per lot in the expandable
 * batch panel. Flagged rows are highlighted.
 */
export default function InventoryTable({ medications, onEdit, onDelete, onBatchesChanged }) {
  const [expandedId, setExpandedId] = useState(null);

  if (medications.length === 0) return <p className="empty">No medications in the catalog yet.</p>;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Medication</th>
            <th>Category</th>
            <th className="num">In stock</th>
            <th className="num">Reorder at</th>
            <th className="num">Unit price</th>
            <th>Next expiry</th>
            <th>Supplier</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {medications.map((med) => {
            const flagged = med.is_low_stock || med.is_near_expiry || med.expired_quantity > 0;
            const expanded = expandedId === med.id;
            return (
              <Fragment key={med.id}>
                <tr className={flagged ? 'is-flagged' : undefined}>
                  <td><strong>{med.name}</strong></td>
                  <td>{med.category}</td>
                  <td className="num">
                    {med.quantity}
                    {med.expired_quantity > 0 && (
                      <div className="muted">+{med.expired_quantity} expired</div>
                    )}
                  </td>
                  <td className="num">{med.low_stock_threshold}</td>
                  <td className="num">{Number(med.unit_price).toFixed(2)}</td>
                  <td>{formatDate(med.expiry_date)}</td>
                  <td>{med.supplier_info}</td>
                  <td><StatusBadges medication={med} /></td>
                  <td className="actions">
                    <button
                      type="button"
                      className="btn btn--sm"
                      aria-expanded={expanded}
                      onClick={() => setExpandedId(expanded ? null : med.id)}
                    >
                      {expanded ? 'Hide lots' : 'Lots'}
                    </button>{' '}
                    <button type="button" className="btn btn--sm" onClick={() => onEdit(med)}>Edit</button>{' '}
                    <button type="button" className="btn btn--sm btn--danger" onClick={() => onDelete(med)}>
                      Delete
                    </button>
                  </td>
                </tr>
                {expanded && (
                  <tr>
                    <td colSpan={9}>
                      <BatchPanel medication={med} onChanged={onBatchesChanged} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
