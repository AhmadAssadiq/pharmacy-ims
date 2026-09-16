import { useCallback, useEffect, useState } from 'react';
import { fetchMedications } from '../../api/medications';
import { fetchMedicationForecast } from '../../api/forecast';
import DemandChart from '../../components/forecast/DemandChart';
import StockProjectionChart from '../../components/forecast/StockProjectionChart';

/**
 * Per-medication demand history and forecast (FR 6.1, UC-3).
 * Nothing is forecast until a medication is picked: selecting one retrains that
 * medication's model on its current sales history and charts the result, so the
 * numbers here include sales made since the last scheduled run.
 */
export default function StaffForecastPage() {
  const [medications, setMedications] = useState([]);
  const [medicationId, setMedicationId] = useState('');
  const [forecast, setForecast] = useState(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMedications()
      .then((data) => setMedications(data.medications))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingCatalog(false));
  }, []);

  const loadForecast = useCallback(async (id) => {
    setLoadingForecast(true);
    setError(null);
    setForecast(null);
    try {
      const data = await fetchMedicationForecast(id);
      setForecast(data.forecast);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingForecast(false);
    }
  }, []);

  const handleSelect = (value) => {
    setMedicationId(value);
    if (value) loadForecast(value);
    else setForecast(null);
  };

  return (
    <>
      <div className="page-header">
        <h1>Demand forecast</h1>
        <div className="status-line">Pick a medication to train its model on the latest sales and chart the result</div>
      </div>

      {error && <div className="alert alert--error" role="alert">{error}</div>}

      <div className="card">
        <h2>Medication</h2>
        {loadingCatalog ? (
          <p className="muted">Loading catalog...</p>
        ) : (
          <label className="field">
            <span className="field__label">Choose a medication to forecast</span>
            <select value={medicationId} onChange={(e) => handleSelect(e.target.value)}>
              <option value="">Select a medication...</option>
              {medications.map((med) => (
                <option key={med.id} value={med.id}>
                  {med.name} — {med.quantity} in stock, reorder at {med.low_stock_threshold}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {loadingForecast && (
        <div className="card">
          <p className="muted">Training the model and forecasting...</p>
        </div>
      )}

      {forecast && !loadingForecast && (
        <>
          <div className="card">
            <h2>{forecast.medication.name}</h2>
            <div className="stock-summary">
              <div>
                <span className="field__label">In stock</span>
                <strong>{forecast.medication.quantity}</strong>
              </div>
              <div>
                <span className="field__label">Reorder at</span>
                <strong>{forecast.medication.low_stock_threshold}</strong>
              </div>
              <div>
                <span className="field__label">Days of history</span>
                <strong>{forecast.history_days}</strong>
              </div>
              <div>
                <span className="field__label">Forecast</span>
                {forecast.status === 'alert' ? (
                  <strong className="text-danger">
                    {forecast.days_until_threshold === 0
                      ? 'Below threshold now'
                      : `Below threshold in ${forecast.days_until_threshold} day${forecast.days_until_threshold === 1 ? '' : 's'}`}
                  </strong>
                ) : forecast.status === 'ok' ? (
                  <strong>Stock holds for 7 days</strong>
                ) : (
                  <strong className="muted">Not enough data</strong>
                )}
              </div>
              {forecast.mae !== null && (
                <div>
                  <span className="field__label">Mean abs. error</span>
                  <strong>{forecast.mae.toFixed(2)} units/day</strong>
                </div>
              )}
            </div>
          </div>

          {forecast.status === 'insufficient_data' ? (
            <div className="card">
              <h2>Sales history</h2>
              <p className="empty">
                {forecast.reason ? `${forecast.reason}.` : 'Not enough sales history to train a model yet.'} The model
                needs at least 14 days of history before it will forecast, so no reorder alert is raised for this
                medication (UC-3 alternative flow).
              </p>
              <DemandChart history={forecast.history} forecast={[]} />
            </div>
          ) : (
            <>
              <div className="card">
                <h2>Daily demand</h2>
                <p className="muted">
                  Units sold per day over the last 30 days, then the model&apos;s predicted demand for the next{' '}
                  {forecast.forecast.length} days.
                </p>
                <DemandChart history={forecast.history} forecast={forecast.forecast} />
              </div>

              <div className="card">
                <h2>Projected stock</h2>
                <p className="muted">
                  Current stock less the predicted demand each day, against this medication&apos;s reorder threshold.
                </p>
                <StockProjectionChart
                  currentQuantity={forecast.medication.quantity}
                  threshold={forecast.medication.low_stock_threshold}
                  forecast={forecast.forecast}
                  asOfDate={forecast.as_of_date}
                />
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
