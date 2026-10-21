import { Fragment, useMemo, useState } from 'react';
import BatchPanel from './BatchPanel';
import { formatDate } from '../../utils/expiry';
import StatusMark, { medicationStatuses } from '../StatusMark';

/* The runway's window: how far ahead the expiry track reaches. */
const RUNWAY_DAYS = 180;

/**
 * The expiry runway — this product's own element.
 *
 * Every row's next-expiry sits on one shared 0-180 day axis, so scanning the
 * column tells you the order your shelves expire in, not just a set of dates
 * you would otherwise have to subtract in your head.
 */
function ExpiryRunway({ days, expiredQuantity }) {
  if (days == null) return <span className="runway__none">No stock</span>;

  const clamped = Math.max(0, Math.min(days, RUNWAY_DAYS));
  const width = days < 0 ? 100 : (clamped / RUNWAY_DAYS) * 100;
  const tone = days < 0 ? 'expired' : days <= 30 ? 'soon' : 'ok';

  return (
    <span className="runway" aria-hidden="true">
      <span className="runway__track">
        <span
          className={`runway__fill ${tone === 'ok' ? '' : `runway__fill--${tone}`}`}
          style={{ width: `${Math.max(width, 3)}%` }}
        />
      </span>
    </span>
  );
}

const COLUMNS = [
  { key: 'name', label: 'Medication', sortable: true },
  { key: 'category', label: 'Category', sortable: true },
  { key: 'quantity', label: 'In stock', sortable: true, num: true },
  { key: 'low_stock_threshold', label: 'Reorder at', sortable: true, num: true },
  { key: 'unit_price', label: 'Unit price', sortable: true, num: true },
  { key: 'expiry', label: 'Next expiry', sortable: true },
  { key: 'supplier_info', label: 'Supplier', sortable: true },
  { key: 'status', label: 'Status', sortable: false },
  { key: 'actions', label: 'Actions', sortable: false },
];

function compare(a, b, key) {
  if (key === 'expiry') {
    const av = a.days_until_expiry ?? Number.POSITIVE_INFINITY;
    const bv = b.days_until_expiry ?? Number.POSITIVE_INFINITY;
    return av - bv;
  }
  const av = a[key];
  const bv = b[key];
  if (typeof av === 'number' || !Number.isNaN(Number(av))) return Number(av) - Number(bv);
  return String(av).localeCompare(String(bv));
}

function SortIcon({ direction }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path
        d={direction === 'descending' ? 'M2 4l3 3 3-3' : 'M2 6l3-3 3 3'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Inventory list with sellable stock levels, per-medication reorder thresholds
 * and expiry flags (FR 4). Stock itself is managed per lot in the expandable
 * batch panel.
 */
export default function InventoryTable({ medications, onEdit, onDelete, onBatchesChanged, onReceive }) {
  const [expandedId, setExpandedId] = useState(null);
  const [sort, setSort] = useState({ key: 'name', direction: 'ascending' });

  const rows = useMemo(() => {
    const sorted = [...medications].sort((a, b) => compare(a, b, sort.key));
    return sort.direction === 'descending' ? sorted.reverse() : sorted;
  }, [medications, sort]);

  const toggleSort = (key) =>
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'ascending' ? 'descending' : 'ascending' }
        : { key, direction: key === 'expiry' || key === 'quantity' ? 'ascending' : 'ascending' }
    );

  if (medications.length === 0) {
    return <p className="empty empty--framed">No medications match these filters.</p>;
  }

  return (
    <div
      className="table-wrap"
      tabIndex={0}
      role="region"
      aria-label="Medication stock, scrollable"
    >
      <table className="table">
        <caption className="sr-only">
          Medications with stock on hand, reorder level, next expiry date and status.
        </caption>
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const active = sort.key === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  data-col={col.key}
                  className={col.num ? 'num' : undefined}
                  aria-sort={active ? sort.direction : col.sortable ? 'none' : undefined}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      className="th-sort"
                      data-active={active}
                      onClick={() => toggleSort(col.key)}
                    >
                      {col.label}
                      <SortIcon direction={active ? sort.direction : 'ascending'} />
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((med) => {
            const expired = med.expired_quantity > 0;
            const flagged = med.is_low_stock || med.is_near_expiry;
            const expanded = expandedId === med.id;
            const rowClass = expired ? 'is-expired' : flagged ? 'is-flagged' : undefined;
            return (
              <Fragment key={med.id}>
                <tr className={rowClass}>
                  <th scope="row" data-col="name" style={{ fontWeight: 400 }}>
                    <span className="med-name">{med.name}</span>
                    {/* At tablet width category and supplier fold into this subline. */}
                    <span className="med-sub med-sub--fold">
                      {med.category} · {med.supplier_info}
                    </span>
                  </th>
                  <td data-col="category">{med.category}</td>
                  <td className="num" data-col="quantity">
                    {med.quantity}
                    {expired && <span className="med-sub">+{med.expired_quantity} expired</span>}
                  </td>
                  <td className="num" data-col="low_stock_threshold">{med.low_stock_threshold}</td>
                  <td className="num" data-col="unit_price">{Number(med.unit_price).toFixed(2)}</td>
                  <td data-col="expiry">
                    <span className="date">{formatDate(med.expiry_date)}</span>
                    <ExpiryRunway days={med.days_until_expiry} />
                  </td>
                  <td data-col="supplier_info">{med.supplier_info}</td>
                  <td data-col="status">
                    <span className="badges">
                      {medicationStatuses(med).map((mark) => (
                        <StatusMark key={mark.label} kind={mark.kind} label={mark.label} />
                      ))}
                    </span>
                  </td>
                  <td className="actions" data-col="actions">
                    <button
                      type="button"
                      className="btn btn--sm"
                      aria-expanded={expanded}
                      onClick={() => setExpandedId(expanded ? null : med.id)}
                    >
                      {expanded ? 'Hide lots' : 'Lots'}
                    </button>{' '}
                    <button type="button" className="btn btn--sm" onClick={() => onEdit(med)}>
                      Edit
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn--sm btn--danger"
                      onClick={() => onDelete(med)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
                {expanded && (
                  <tr>
                    <td colSpan={COLUMNS.length}>
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
