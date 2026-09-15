import QuantityEditor from './QuantityEditor';

function StatusBadges({ medication }) {
  const badges = [];
  if (medication.is_out_of_stock) badges.push(<span key="out" className="badge badge--danger">Out of stock</span>);
  else if (medication.is_low_stock) badges.push(<span key="low" className="badge badge--warning">Low stock</span>);
  if (medication.is_expired) badges.push(<span key="exp" className="badge badge--danger">Expired</span>);
  else if (medication.is_near_expiry) {
    badges.push(<span key="near" className="badge badge--warning">Expires in {medication.days_until_expiry} d</span>);
  }
  if (badges.length === 0) badges.push(<span key="ok" className="badge badge--success">OK</span>);
  return <span className="badges">{badges}</span>;
}

/**
 * Inventory list with real-time stock levels and low-stock / near-expiry
 * flags (FR 4). Flagged rows are highlighted.
 */
export default function InventoryTable({ medications, onEdit, onDelete, onUpdateQuantity }) {
  if (medications.length === 0) return <p className="empty">No medications in the catalog yet.</p>;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Medication</th>
            <th>Category</th>
            <th>Quantity</th>
            <th className="num">Unit price</th>
            <th>Expiry date</th>
            <th>Supplier</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {medications.map((med) => {
            const flagged = med.is_low_stock || med.is_near_expiry;
            return (
              <tr key={med.id} className={flagged ? 'is-flagged' : undefined}>
                <td><strong>{med.name}</strong></td>
                <td>{med.category}</td>
                <td><QuantityEditor medication={med} onSave={onUpdateQuantity} /></td>
                <td className="num">{Number(med.unit_price).toFixed(2)}</td>
                <td>{String(med.expiry_date).slice(0, 10)}</td>
                <td>{med.supplier_info}</td>
                <td><StatusBadges medication={med} /></td>
                <td className="actions">
                  <button type="button" className="btn btn--sm" onClick={() => onEdit(med)}>Edit</button>{' '}
                  <button type="button" className="btn btn--sm btn--danger" onClick={() => onDelete(med)}>Delete</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
