import { Fragment, useMemo, useState } from 'react';
import BatchPanel from './BatchPanel';
import StatusMark, { medicationStatuses } from '../StatusMark';
import { useI18n } from '../../i18n/I18nContext';

/* The runway's window: how far ahead the expiry track reaches. */
const RUNWAY_DAYS = 180;

/**
 * The expiry runway — this product's own element.
 *
 * Every row's next-expiry sits on one shared 0-180 day axis, so scanning the
 * column tells you the order your shelves expire in, not just a set of dates
 * you would otherwise have to subtract in your head. It fills from the start
 * edge, so it mirrors with the rest of the row in Arabic.
 */
function ExpiryRunway({ days }) {
  const { t } = useI18n();
  if (days == null) return <span className="runway__none">{t('table.noStock')}</span>;

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
export default function InventoryTable({ medications, onEdit, onDelete, onBatchesChanged }) {
  const { t, formatDate, formatPrice } = useI18n();
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
        : { key, direction: 'ascending' }
    );

  if (medications.length === 0) {
    return <p className="empty empty--framed">{t('table.noMatch')}</p>;
  }

  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={t('table.regionLabel')}>
      <table className="table">
        <caption className="sr-only">{t('table.caption')}</caption>
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
                      {t(col.label)}
                      <SortIcon direction={active ? sort.direction : 'ascending'} />
                    </button>
                  ) : (
                    t(col.label)
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
                    {/* <bdi>: stored names and suppliers are mostly Latin; isolating them
                        keeps "Hikma - +962 6 580 2900" in order inside an Arabic row. */}
                    <span className="med-name"><bdi>{med.name}</bdi></span>
                    {/* At tablet width category and supplier fold into this subline. */}
                    <span className="med-sub med-sub--fold">
                      <bdi>{med.category}</bdi> · <bdi>{med.supplier_info}</bdi>
                    </span>
                  </th>
                  <td data-col="category"><bdi>{med.category}</bdi></td>
                  <td className="num" data-col="quantity">
                    {med.quantity}
                    {expired && (
                      <span className="med-sub">{t('table.expiredExtra', { count: med.expired_quantity })}</span>
                    )}
                  </td>
                  <td className="num" data-col="low_stock_threshold">{med.low_stock_threshold}</td>
                  <td className="num" data-col="unit_price">{formatPrice(med.unit_price)}</td>
                  <td data-col="expiry">
                    <span className="date">{formatDate(med.expiry_date)}</span>
                    <ExpiryRunway days={med.days_until_expiry} />
                  </td>
                  <td data-col="supplier_info"><bdi>{med.supplier_info}</bdi></td>
                  <td data-col="status">
                    <span className="badges">
                      {medicationStatuses(med, t).map((mark) => (
                        <StatusMark key={mark.kind} kind={mark.kind} label={mark.label} />
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
                      {expanded ? t('table.hideLots') : t('table.lots')}
                    </button>{' '}
                    <button type="button" className="btn btn--sm" onClick={() => onEdit(med)}>
                      {t('common.edit')}
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn--sm btn--danger"
                      onClick={() => onDelete(med)}
                    >
                      {t('common.delete')}
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
