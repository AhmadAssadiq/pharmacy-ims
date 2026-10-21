import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dismissAlert, fetchAlerts } from '../../api/alerts';
import { formatDate } from '../../utils/expiry';

const REFRESH_INTERVAL_MS = 60_000;

/**
 * ML alert panel on the staff inventory screen (FR 6.2, UC-3).
 *
 * Every alert leads with the action it wants — receive stock — rather than
 * with the only thing that used to be on offer, which was making the warning
 * go away. Dismiss is demoted to a ghost button.
 */
export default function ReorderAlertPanel() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAlerts();
      setAlerts(data.alerts);
      setError(null);
    } catch (err) {
      setError(err.message);
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
      setError(err.message);
    }
  };

  return (
    <section className="card" aria-labelledby="reorder-alerts-heading">
      <div className="card__header">
        <h2 id="reorder-alerts-heading">Reorder alerts</h2>
        <span className="card__note">
          Forecast from this pharmacy&apos;s own sales. Predicted to fall below its reorder level
          within 7 days.
        </span>
      </div>

      {error && (
        <div className="alert alert--error" role="alert">
          Couldn&apos;t load reorder alerts. {error}{' '}
          <button type="button" className="btn btn--sm btn--ghost" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {loading && <p className="empty">Loading alerts...</p>}

      {!loading && !error && alerts.length === 0 && (
        <p className="empty empty--framed">
          No reorder alerts. Nothing is forecast to fall below its reorder level in the next 7 days.
        </p>
      )}

      <ul className="list">
        {alerts.map((alert) => {
          const now = alert.days_until_threshold === 0;
          return (
            <li key={alert.id} className={`alert-row ${now ? 'alert-row--now' : ''}`}>
              <span className="alert-row__days" aria-hidden="true">
                <span className="alert-row__num">{alert.days_until_threshold}</span>
                <span className="alert-row__unit">
                  {alert.days_until_threshold === 1 ? 'day' : 'days'}
                </span>
              </span>
              <span className="alert-row__body">
                <span className="alert-row__name">{alert.medication_name}</span>
                <span className="alert-row__meta">
                  {now
                    ? 'Already below its reorder level'
                    : `Falls below its reorder level on ${formatDate(alert.predicted_date)}`}
                  {' · '}
                  <span className="num">{alert.current_quantity}</span> in stock, reorder at{' '}
                  <span className="num">{alert.low_stock_threshold}</span>
                </span>
              </span>
              <span className="alert-row__actions">
                <Link
                  to={`/staff/stock?medication=${alert.medication_id}`}
                  className="btn btn--sm"
                >
                  Receive stock
                </Link>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => handleDismiss(alert)}
                  aria-label={`Dismiss the reorder alert for ${alert.medication_name}`}
                >
                  Dismiss
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
