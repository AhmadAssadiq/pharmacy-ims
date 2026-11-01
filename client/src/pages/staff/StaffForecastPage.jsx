// The Forecast page (FR 6.1, UC-3): demand history and forecast for one medication.
// Nothing is forecast until a medication is chosen. Choosing one retrains its model on its
// latest sales (so sales made seconds ago are included) and shows:
//   - a summary (stock, reorder level, days of history, the forecast, which model, its error),
//   - daily demand: the last 30 days and the next 7 predicted days,
//   - for seasonal models: monthly sales of the last two years and the next three months,
//   - projected stock against the reorder level (what the reorder alert is based on).
import { useEffect, useState } from 'react';
import { fetchMedications } from '../../api/medications';
import { fetchMedicationForecast } from '../../api/forecast';
import DemandChart from '../../components/forecast/DemandChart';
import MonthlyChart from '../../components/forecast/MonthlyChart';
import StockProjectionChart from '../../components/forecast/StockProjectionChart';
import { useI18n } from '../../i18n/useI18n';
import constants from '../../../../shared/constants.json';

export default function StaffForecastPage() {
  const { t, te, lang } = useI18n();
  const [medications, setMedications] = useState([]);
  const [medicationId, setMedicationId] = useState('');
  const [forecast, setForecast] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [error, setError] = useState(null);

  // On load: the medications for the drop-down
  useEffect(() => {
    fetchMedications()
      .then((data) => setMedications(data.medications))
      .catch((loadError) => setError(loadError))
      .finally(() => setLoadingList(false));
  }, []);

  // A medication was chosen: train its model and load its forecast
  async function handleSelect(id) {
    setMedicationId(id);
    setForecast(null);
    if (!id) {
      return;
    }
    setLoadingForecast(true);
    setError(null);
    try {
      const data = await fetchMedicationForecast(id);
      setForecast(data.forecast);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoadingForecast(false);
    }
  }

  // The forecast result in words: "Below threshold in 3 days", "Stock holds for 7 days"...
  function forecastResult() {
    if (forecast.status === 'alert') {
      const text =
        forecast.days_until_threshold === 0
          ? t('forecast.belowNow')
          : t('forecast.belowIn', { count: forecast.days_until_threshold });
      return <strong className="text-danger">{text}</strong>;
    }
    if (forecast.status === 'ok') {
      return <strong>{t('forecast.holds', { count: constants.FORECAST_HORIZON_DAYS })}</strong>;
    }
    return <strong className="muted">{t('forecast.notEnoughData')}</strong>;
  }

  // Why there is no forecast. The ML service explains it in English, so in Arabic we use our own sentence.
  let notEnoughDataReason = t('forecast.insufficientDefault');
  if (forecast && lang === 'en' && forecast.reason) {
    notEnoughDataReason = `${forecast.reason}.`;
  }

  return (
    <>
      <div className="page-header">
        <h1>{t('forecast.title')}</h1>
        <div className="status-line">{t('forecast.subtitle')}</div>
      </div>

      {error && <div className="alert alert--error" role="alert">{te(error)}</div>}

      {/* Choose a medication */}
      <div className="card">
        <h2>{t('common.medication')}</h2>
        {loadingList ? (
          <p className="muted">{t('common.loadingCatalog')}</p>
        ) : (
          <label className="field">
            <span className="field__label">{t('forecast.choose')}</span>
            <select value={medicationId} onChange={(event) => handleSelect(event.target.value)}>
              <option value="">{t('forecast.selectMedication')}</option>
              {medications.map((medication) => (
                <option key={medication.id} value={medication.id}>
                  {t('forecast.option', {
                    name: medication.name,
                    quantity: medication.quantity,
                    threshold: medication.low_stock_threshold,
                  })}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {loadingForecast && (
        <div className="card">
          <p className="muted">{t('forecast.training')}</p>
        </div>
      )}

      {forecast && !loadingForecast && (
        <>
          {/* Summary */}
          <div className="card">
            <h2><bdi>{forecast.medication.name}</bdi></h2>
            <div className="stock-summary">
              <div>
                <span className="field__label">{t('common.inStock')}</span>
                <strong>{forecast.medication.quantity}</strong>
              </div>
              <div>
                <span className="field__label">{t('common.reorderAt')}</span>
                <strong>{forecast.medication.low_stock_threshold}</strong>
              </div>
              <div>
                <span className="field__label">{t('forecast.historyDays')}</span>
                <strong>{forecast.history_days}</strong>
              </div>
              <div>
                <span className="field__label">{t('forecast.forecast')}</span>
                {forecastResult()}
              </div>
              {forecast.trained && (
                <div>
                  <span className="field__label">{t('forecast.model')}</span>
                  <strong>{t(forecast.seasonal ? 'forecast.modelSeasonal' : 'forecast.modelBasic')}</strong>
                </div>
              )}
              {forecast.mae !== null && (
                <div>
                  <span className="field__label">{t('forecast.mae')}</span>
                  <strong>{t('forecast.maeValue', { value: forecast.mae.toFixed(2) })}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Not enough history: only the sales so far */}
          {forecast.status === 'insufficient_data' && (
            <div className="card">
              <h2>{t('forecast.historyTitle')}</h2>
              <p className="empty">
                {notEnoughDataReason} {t('forecast.insufficientNote')}
              </p>
              <DemandChart history={forecast.history} forecast={[]} />
            </div>
          )}

          {/* A forecast: the three charts */}
          {forecast.status !== 'insufficient_data' && (
            <>
              <div className="card">
                <h2>{t('forecast.dailyDemand')}</h2>
                <p className="muted">{t('forecast.dailyNote', { count: forecast.forecast.length })}</p>
                <DemandChart history={forecast.history} forecast={forecast.forecast} />
              </div>

              {forecast.seasonal && (
                <div className="card">
                  <h2>{t('forecast.monthly')}</h2>
                  <p className="muted">{t('forecast.monthlyNote')}</p>
                  <MonthlyChart history={forecast.history} outlook={forecast.outlook} asOfDate={forecast.as_of_date} />
                </div>
              )}

              <div className="card">
                <h2>{t('forecast.projected')}</h2>
                <p className="muted">{t('forecast.projectedNote')}</p>
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
