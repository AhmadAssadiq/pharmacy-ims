// The stock table on the inventory page (FR 4): each medication's sellable stock, reorder
// threshold, price, next expiry, supplier and status badges. Columns can be sorted by
// clicking their heading. "Lots" opens the medication's stock lots (BatchPanel) under its row.
import { Fragment, useState } from 'react';
import BatchPanel from './BatchPanel';
import StatusMark, { medicationStatuses } from '../StatusMark';
import { useI18n } from '../../i18n/useI18n';

// How many days ahead the expiry bar ("runway") reaches
const RUNWAY_DAYS = 180;

// A small bar under the expiry date: the shorter it is, the sooner the next lot expires.
// All rows share the same 0-180 day scale, so you can compare them at a glance.
function ExpiryRunway({ days }) {
  const { t } = useI18n();
  if (days === null || days === undefined) {
    return <span className="runway__none">{t('table.noStock')}</span>;
  }

  // Width in % of the 180 days (an expired lot fills the whole bar, in red)
  let widthPercent = (Math.max(0, Math.min(days, RUNWAY_DAYS)) / RUNWAY_DAYS) * 100;
  let colourClass = '';
  if (days < 0) {
    widthPercent = 100;
    colourClass = 'runway__fill--expired';
  } else if (days <= 30) {
    colourClass = 'runway__fill--soon';
  }

  return (
    <span className="runway" aria-hidden="true">
      <span className="runway__track">
        <span className={`runway__fill ${colourClass}`} style={{ width: `${Math.max(widthPercent, 3)}%` }} />
      </span>
    </span>
  );
}

// The table's columns: `label` is the translation key, `num` aligns numbers to the end
const COLUMNS = [
  { key: 'name', label: 'common.medication', sortable: true },
  { key: 'category', label: 'table.colCategory', sortable: true },
  { key: 'quantity', label: 'common.inStock', sortable: true, num: true },
  { key: 'low_stock_threshold', label: 'common.reorderAt', sortable: true, num: true },
  { key: 'unit_price', label: 'table.colPrice', sortable: true, num: true },
  { key: 'expiry', label: 'common.nextExpiry', sortable: true },
  { key: 'supplier_info', label: 'table.colSupplier', sortable: true },
  { key: 'status', label: 'common.status', sortable: false },
  { key: 'actions', label: 'common.actions', sortable: false },
];

// Compares two medications by one column (for sorting)
function compareBy(first, second, columnKey) {
  // Medications with no sellable lot have no expiry: they go last
  if (columnKey === 'expiry') {
    const firstDays = first.days_until_expiry ?? Infinity;
    const secondDays = second.days_until_expiry ?? Infinity;
    return firstDays - secondDays;
  }
  const firstValue = first[columnKey];
  const secondValue = second[columnKey];
  // Numbers (including prices sent as text, like "4.80") compare as numbers, text alphabetically
  if (!Number.isNaN(Number(firstValue))) {
    return Number(firstValue) - Number(secondValue);
  }
  return String(firstValue).localeCompare(String(secondValue));
}

// The little arrow next to a sorted column heading
function SortIcon({ direction }) {
  const path = direction === 'descending' ? 'M2 4l3 3 3-3' : 'M2 6l3-3 3 3';
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function InventoryTable({ medications, onEdit, onDelete, onBatchesChanged }) {
  const { t, formatDate, formatPrice } = useI18n();
  const [openLotsId, setOpenLotsId] = useState(null); // the medication whose lots are shown
  const [sortKey, setSortKey] = useState('name');
  const [sortDirection, setSortDirection] = useState('ascending');

  // Clicking the sorted column again flips the direction; another column sorts A to Z
  function changeSort(columnKey) {
    if (columnKey === sortKey) {
      setSortDirection(sortDirection === 'ascending' ? 'descending' : 'ascending');
    } else {
      setSortKey(columnKey);
      setSortDirection('ascending');
    }
  }

  if (medications.length === 0) {
    return <p className="empty empty--framed">{t('table.noMatch')}</p>;
  }

  // Sort a copy of the list (never change the list we were given)
  const rows = [...medications].sort((first, second) => compareBy(first, second, sortKey));
  if (sortDirection === 'descending') {
    rows.reverse();
  }

  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={t('table.regionLabel')}>
      <table className="table">
        <caption className="sr-only">{t('table.caption')}</caption>
        <thead>
          <tr>
            {COLUMNS.map((column) => {
              const isSorted = sortKey === column.key;
              let ariaSort;
              if (isSorted) ariaSort = sortDirection;
              else if (column.sortable) ariaSort = 'none';
              return (
                <th key={column.key} scope="col" data-col={column.key} className={column.num ? 'num' : undefined} aria-sort={ariaSort}>
                  {column.sortable ? (
                    <button type="button" className="th-sort" data-active={isSorted} onClick={() => changeSort(column.key)}>
                      {t(column.label)}
                      <SortIcon direction={isSorted ? sortDirection : 'ascending'} />
                    </button>
                  ) : (
                    t(column.label)
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((medication) => {
            const hasExpiredUnits = medication.expired_quantity > 0;
            const isFlagged = medication.is_low_stock || medication.is_near_expiry;
            const lotsAreOpen = openLotsId === medication.id;

            // Rows with expired units are tinted red, flagged rows amber
            let rowClass;
            if (hasExpiredUnits) rowClass = 'is-expired';
            else if (isFlagged) rowClass = 'is-flagged';

            return (
              <Fragment key={medication.id}>
                <tr className={rowClass}>
                  <th scope="row" data-col="name" style={{ fontWeight: 400 }}>
                    {/* <bdi> keeps a Latin name or supplier in the right order inside an Arabic row */}
                    <span className="med-name"><bdi>{medication.name}</bdi></span>
                    {/* On a tablet the category and supplier columns are hidden and shown here instead */}
                    <span className="med-sub med-sub--fold">
                      <bdi>{medication.category}</bdi> · <bdi>{medication.supplier_info}</bdi>
                    </span>
                  </th>
                  <td data-col="category"><bdi>{medication.category}</bdi></td>
                  <td className="num" data-col="quantity">
                    {medication.quantity}
                    {hasExpiredUnits && (
                      <span className="med-sub">{t('table.expiredExtra', { count: medication.expired_quantity })}</span>
                    )}
                  </td>
                  <td className="num" data-col="low_stock_threshold">{medication.low_stock_threshold}</td>
                  <td className="num" data-col="unit_price">{formatPrice(medication.unit_price)}</td>
                  <td data-col="expiry">
                    <span className="date">{formatDate(medication.expiry_date)}</span>
                    <ExpiryRunway days={medication.days_until_expiry} />
                  </td>
                  <td data-col="supplier_info"><bdi>{medication.supplier_info}</bdi></td>
                  <td data-col="status">
                    <span className="badges">
                      {medicationStatuses(medication, t).map((mark) => (
                        <StatusMark key={mark.kind} kind={mark.kind} label={mark.label} />
                      ))}
                    </span>
                  </td>
                  <td className="actions" data-col="actions">
                    <button
                      type="button"
                      className="btn btn--sm"
                      aria-expanded={lotsAreOpen}
                      onClick={() => setOpenLotsId(lotsAreOpen ? null : medication.id)}
                    >
                      {lotsAreOpen ? t('table.hideLots') : t('table.lots')}
                    </button>{' '}
                    <button type="button" className="btn btn--sm" onClick={() => onEdit(medication)}>
                      {t('common.edit')}
                    </button>{' '}
                    <button type="button" className="btn btn--sm btn--danger" onClick={() => onDelete(medication)}>
                      {t('common.delete')}
                    </button>
                  </td>
                </tr>

                {/* The stock lots, in an extra row under the medication */}
                {lotsAreOpen && (
                  <tr>
                    <td colSpan={COLUMNS.length}>
                      <BatchPanel medication={medication} onChanged={onBatchesChanged} />
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
