import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPreorders, updatePreorderStatus } from '../../api/preorders';
import ConfirmDialog from '../../components/ConfirmDialog';
import { PreorderStatus } from '../../components/StatusMark';
import { useI18n } from '../../i18n/I18nContext';
import constants from '../../../../shared/constants.json';

const { PREORDER_STATUS } = constants;
const FILTERS = ['all', ...Object.values(PREORDER_STATUS)];

/**
 * Staff preorder queue (GP2 addition). Requests arrive from patients for
 * medications that are out of stock. Staff mark one ready when the stock is in,
 * and collected when the patient picks it up; collecting dispenses the stock
 * nearest-expiry-first in the same step, which is why it sits behind a confirm.
 */
export default function StaffPreordersPage() {
  const { t, te, formatDateTime } = useI18n();
  const [preorders, setPreorders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [filter, setFilter] = useState(PREORDER_STATUS.PENDING);
  const [confirming, setConfirming] = useState(null); // { preorder, status }
  const [busyId, setBusyId] = useState(null);
  const errorRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchPreorders();
      setPreorders(data.preorders);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Move the keyboard to the error, as Dispense does.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const counts = useMemo(() => {
    const byStatus = Object.fromEntries(FILTERS.map((key) => [key, 0]));
    for (const p of preorders) byStatus[p.status] += 1;
    byStatus.all = preorders.length;
    return byStatus;
  }, [preorders]);

  const visible = filter === 'all' ? preorders : preorders.filter((p) => p.status === filter);

  const move = async (preorder, status) => {
    setError(null);
    setNotice(null);
    setBusyId(preorder.id);
    try {
      await updatePreorderStatus(preorder.id, status);
      await load();
      setNotice(t(`preorders.moved.${status}`, { name: preorder.medication_name, patient: preorder.patient_name }));
    } catch (err) {
      setError(err);
    } finally {
      setBusyId(null);
      setConfirming(null);
    }
  };

  const dialog = confirming && {
    collected: {
      title: t('preorders.collectTitle'),
      lead: t('preorders.collectLead', {
        quantity: confirming.preorder.quantity,
        name: confirming.preorder.medication_name,
        patient: confirming.preorder.patient_name,
      }),
      confirmLabel: t('preorders.collectConfirm'),
    },
    cancelled: {
      title: t('preorders.cancelTitle'),
      lead: t('preorders.staffCancelLead', { patient: confirming.preorder.patient_name }),
      confirmLabel: t('preorders.cancelRequest'),
    },
  }[confirming.status];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t('preorders.staffTitle')}</h1>
          {!loading && (
            <p className="page-finding">
              {counts.ready > 0
                ? t('preorders.findingReady', { count: <strong>{counts.ready}</strong>, n: counts.ready })
                : counts.pending > 0
                  ? t('preorders.findingPending', { count: <strong>{counts.pending}</strong>, n: counts.pending })
                  : t('preorders.findingNone')}
            </p>
          )}
        </div>
      </div>

      {notice && (
        <div className="alert alert--success" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="alert alert--error" role="alert" tabIndex={-1} ref={errorRef}>
          {te(error)}
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          {FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              className="chip"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {key === 'all' ? t('inventory.chipAll') : t(`preorders.status.${key}`)}
              <span className="chip__count">{counts[key]}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <p className="empty">{t('common.loading')}</p>
        ) : visible.length === 0 ? (
          <p className="empty empty--framed">{t('preorders.staffEmpty')}</p>
        ) : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label={t('preorders.regionLabel')}>
            <table className="table">
              <caption className="sr-only">{t('preorders.caption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('preorders.colRequested')}</th>
                  <th scope="col">{t('preorders.colPatient')}</th>
                  <th scope="col">{t('common.medication')}</th>
                  <th scope="col" className="num">{t('common.quantity')}</th>
                  <th scope="col">{t('preorders.colNote')}</th>
                  <th scope="col">{t('common.status')}</th>
                  <th scope="col" className="actions">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id}>
                    <td className="date">{formatDateTime(p.created_at)}</td>
                    <td><bdi>{p.patient_name}</bdi></td>
                    <th scope="row" style={{ fontWeight: 500 }}><bdi>{p.medication_name}</bdi></th>
                    <td className="num">{p.quantity}</td>
                    <td className="muted">{p.note ? <bdi>{p.note}</bdi> : '—'}</td>
                    <td><PreorderStatus status={p.status} t={t} /></td>
                    <td className="actions">
                      {p.status === PREORDER_STATUS.PENDING && (
                        <button
                          type="button"
                          className="btn btn--sm"
                          disabled={busyId === p.id}
                          onClick={() => move(p, PREORDER_STATUS.READY)}
                        >
                          {t('preorders.markReady')}
                        </button>
                      )}
                      {p.status === PREORDER_STATUS.READY && (
                        <button
                          type="button"
                          className="btn btn--sm btn--primary"
                          disabled={busyId === p.id}
                          onClick={() => setConfirming({ preorder: p, status: PREORDER_STATUS.COLLECTED })}
                        >
                          {t('preorders.markCollected')}
                        </button>
                      )}
                      {(p.status === PREORDER_STATUS.PENDING || p.status === PREORDER_STATUS.READY) && (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="btn btn--sm btn--ghost"
                            disabled={busyId === p.id}
                            onClick={() => setConfirming({ preorder: p, status: PREORDER_STATUS.CANCELLED })}
                          >
                            {t('preorders.cancelRequest')}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirming)}
        title={dialog?.title ?? ''}
        lead={dialog?.lead}
        confirmLabel={dialog?.confirmLabel}
        cancelLabel={t('sell.goBack')}
        busy={Boolean(busyId)}
        onCancel={() => setConfirming(null)}
        onConfirm={() => move(confirming.preorder, confirming.status)}
      />
    </>
  );
}
