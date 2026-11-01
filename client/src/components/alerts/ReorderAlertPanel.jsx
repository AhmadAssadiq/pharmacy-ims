// The reorder alerts on the inventory page (FR 6.2, UC-3).
// The forecast predicts which medications will fall below their reorder level within 7 days.
// Each alert shows how many days are left and offers "Receive stock" (the action it asks for);
// "Dismiss" hides an alert. The list refreshes itself every minute.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dismissAlert, fetchAlerts } from '../../api/alerts';
import StyledText from '../StyledText';
import { useI18n } from '../../i18n/useI18n';
import constants from '../../../../shared/constants.json';

const REFRESH_EVERY_MS = 60000; // 1 minute
const { FORECAST_HORIZON_DAYS } = constants;

export default function ReorderAlertPanel() {
  const { t, te, formatDate } = useI18n();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Loads (or reloads) the active alerts
  async function loadAlerts() {
    try {
      const data = await fetchAlerts();
      setAlerts(data.alerts);
      setError(null);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }

  // Load now, then again every minute (until the page closes)
  useEffect(() => {
    loadAlerts();
    const timer = setInterval(loadAlerts, REFRESH_EVERY_MS);
    return () => clearInterval(timer);
  }, []);

  async function handleDismiss(alert) {
    try {
      await dismissAlert(alert.id);
      setAlerts(alerts.filter((item) => item.id !== alert.id));
    } catch (dismissError) {
      setError(dismissError);
    }
  }

  return (
    <section className="card" aria-labelledby="reorder-alerts-heading">
      <div className="card__header">
        <h2 id="reorder-alerts-heading">{t('alerts.title')}</h2>
        <span className="card__note">{t('alerts.note', { days: FORECAST_HORIZON_DAYS })}</span>
      </div>

      {error && (
        <div className="alert alert--error" role="alert">
          {t('alerts.loadError', { error: te(error) })}{' '}
          <button type="button" className="btn btn--sm btn--ghost" onClick={loadAlerts}>
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
          // 0 days: the stock is already below the reorder level
          const isBelowNow = alert.days_until_threshold === 0;
          return (
            <li key={alert.id} className={`alert-row ${isBelowNow ? 'alert-row--now' : ''}`}>
              {/* The big number: days until the stock falls below its reorder level */}
              <span className="alert-row__days" aria-hidden="true">
                <span className="alert-row__num">{alert.days_until_threshold}</span>
                <span className="alert-row__unit">{t('alerts.dayUnit', { count: alert.days_until_threshold })}</span>
              </span>
              <span className="alert-row__body">
                <span className="alert-row__name"><bdi>{alert.medication_name}</bdi></span>
                <span className="alert-row__meta">
                  {isBelowNow ? t('alerts.alreadyBelow') : t('alerts.fallsOn', { date: formatDate(alert.predicted_date) })}
                  {' · '}
                  <StyledText id="alerts.stockLine" values={{ quantity: alert.current_quantity, threshold: alert.low_stock_threshold }} />
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
