import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dismissAlert, fetchAlerts } from '../../api/alerts';
import { useI18n } from '../../i18n/I18nContext';
import constants from '../../../../shared/constants.json';

const REFRESH_INTERVAL_MS = 60_000;
const { FORECAST_HORIZON_DAYS } = constants;

/**
 * ML alert panel on the staff inventory screen (FR 6.2, UC-3).
 *
 * Every alert leads with the action it wants — receive stock — rather than
 * with the only thing that used to be on offer, which was making the warning
 * go away. Dismiss is demoted to a ghost button.
 */
export default function ReorderAlertPanel() {
  const { t, te, formatDate } = useI18n();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAlerts();
      setAlerts(data.alerts);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const handleDismiss = async (alert) => {
    try {
      await dismissAlert(alert.id);
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
    } catch (err) {
      setError(err);
    }
  };

  return (
    <section className="card" aria-labelledby="reorder-alerts-heading">
      <div className="card__header">
        <h2 id="reorder-alerts-heading">{t('alerts.title')}</h2>
        <span className="card__note">{t('alerts.note', { days: FORECAST_HORIZON_DAYS })}</span>
      </div>

      {error && (
        <div className="alert alert--error" role="alert">
          {t('alerts.loadError', { error: te(error) })}{' '}
          <button type="button" className="btn btn--sm btn--ghost" onClick={load}>
            {t('common.retry')}
          </button>
        </div>
      )}

      {loading && <p className="empty">{t('alerts.loading')}</p>}

      {!loading && !error && alerts.length === 0 && (
        <p className="empty empty--framed">{t('alerts.none', { days: FORECAST_HORIZON_DAYS })}</p>
      )}

      <ul className="list">
        {alerts.map((alert) => {
          const now = alert.days_until_threshold === 0;
          return (
            <li key={alert.id} className={`alert-row ${now ? 'alert-row--now' : ''}`}>
              <span className="alert-row__days" aria-hidden="true">
                <span className="alert-row__num">{alert.days_until_threshold}</span>
                <span className="alert-row__unit">{t('alerts.dayUnit', { count: alert.days_until_threshold })}</span>
              </span>
              <span className="alert-row__body">
                <span className="alert-row__name"><bdi>{alert.medication_name}</bdi></span>
                <span className="alert-row__meta">
                  {now ? t('alerts.alreadyBelow') : t('alerts.fallsOn', { date: formatDate(alert.predicted_date) })}
                  {' · '}
                  {t('alerts.stockLine', {
                    quantity: <span className="num">{alert.current_quantity}</span>,
                    threshold: <span className="num">{alert.low_stock_threshold}</span>,
                  })}
                </span>
              </span>
              <span className="alert-row__actions">
                <Link to={`/staff/stock?medication=${alert.medication_id}`} className="btn btn--sm">
                  {t('alerts.receive')}
                </Link>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => handleDismiss(alert)}
                  aria-label={t('alerts.dismissLabel', { name: alert.medication_name })}
                >
                  {t('alerts.dismiss')}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
