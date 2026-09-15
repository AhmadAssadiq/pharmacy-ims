import { useCallback, useEffect, useState } from 'react';
import { dismissAlert, fetchAlerts } from '../../api/alerts';

const REFRESH_INTERVAL_MS = 60_000;

/**
 * ML alert panel on the staff dashboard (FR 6.2, UC-3). Shows every active
 * reorder alert written by the background forecast job, with the medication
 * name and the predicted days until it drops below the safe threshold.
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
    <section className="card" aria-label="Reorder alerts">
      <div className="page-header" style={{ marginBottom: '0.5rem' }}>
        <h2>Reorder alerts</h2>
        <span className="status-line">Forecast: medications predicted to fall below the safe threshold within 7 days</span>
      </div>

      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {loading && <p className="muted">Loading alerts...</p>}
      {!loading && alerts.length === 0 && <p className="empty">No reorder alerts. Stock levels look fine for the next 7 days.</p>}

      <ul className="list">
        {alerts.map((alert) => (
          <li key={alert.id} className="list__item">
            <span>
              <strong>{alert.medication_name}</strong>{' '}
              <span className={`badge ${alert.days_until_threshold <= 2 ? 'badge--danger' : 'badge--warning'}`}>
                {alert.days_until_threshold === 0
                  ? 'Below threshold now'
                  : `Below threshold in ${alert.days_until_threshold} day${alert.days_until_threshold === 1 ? '' : 's'}`}
              </span>
              <br />
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                Predicted date {String(alert.predicted_date).slice(0, 10)} · current stock {alert.current_quantity}
              </span>
            </span>
            <button type="button" className="btn btn--sm" onClick={() => handleDismiss(alert)}>
              Dismiss
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
