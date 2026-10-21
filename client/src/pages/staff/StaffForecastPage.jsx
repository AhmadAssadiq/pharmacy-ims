import { useCallback, useEffect, useState } from 'react';
import { fetchMedications } from '../../api/medications';
import { fetchMedicationForecast } from '../../api/forecast';
import DemandChart from '../../components/forecast/DemandChart';
import StockProjectionChart from '../../components/forecast/StockProjectionChart';
import { useI18n } from '../../i18n/I18nContext';
import constants from '../../../../shared/constants.json';

/**
 * Per-medication demand history and forecast (FR 6.1, UC-3).
 * Nothing is forecast until a medication is picked: selecting one retrains that
 * medication's model on its current sales history and charts the result, so the
 * numbers here include sales made since the last scheduled run.
 */
export default function StaffForecastPage() {
  const { t, te, lang } = useI18n();
  const [medications, setMedications] = useState([]);
  const [medicationId, setMedicationId] = useState('');
  const [forecast, setForecast] = useState(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMedications()
      .then((data) => setMedications(data.medications))
      .catch((err) => setError(err))
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
      setError(err);
    } finally {
      setLoadingForecast(false);
    }
  }, []);

  const handleSelect = (value) => {
    setMedicationId(value);
    if (value) loadForecast(value);
    else setForecast(null);
  };

  // The ML service explains a short history in English; Arabic gets our own sentence.
  const insufficientReason =
    lang === 'en' && forecast?.reason ? `${forecast.reason}.` : t('forecast.insufficientDefault');

  return (
    <>
      <div className="page-header">
        <h1>{t('forecast.title')}</h1>
        <div className="status-line">{t('forecast.subtitle')}</div>
      </div>

      {error && <div className="alert alert--error" role="alert">{te(error)}</div>}

      <div className="card">
        <h2>{t('common.medication')}</h2>
        {loadingCatalog ? (
          <p className="muted">{t('common.loadingCatalog')}</p>
        ) : (
          <label className="field">
            <span className="field__label">{t('forecast.choose')}</span>
            <select value={medicationId} onChange={(e) => handleSelect(e.target.value)}>
              <option value="">{t('forecast.selectMedication')}</option>
              {medications.map((med) => (
                <option key={med.id} value={med.id}>
                  {t('forecast.option', { name: med.name, quantity: med.quantity, threshold: med.low_stock_threshold })}
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
                {forecast.status === 'alert' ? (
                  <strong className="text-danger">
                    {forecast.days_until_threshold === 0
                      ? t('forecast.belowNow')
                      : t('forecast.belowIn', { count: forecast.days_until_threshold })}
                  </strong>
                ) : forecast.status === 'ok' ? (
                  <strong>{t('forecast.holds', { count: constants.FORECAST_HORIZON_DAYS })}</strong>
                ) : (
                  <strong className="muted">{t('forecast.notEnoughData')}</strong>
                )}
              </div>
              {forecast.mae !== null && (
                <div>
                  <span className="field__label">{t('forecast.mae')}</span>
                  <strong>{t('forecast.maeValue', { value: forecast.mae.toFixed(2) })}</strong>
                </div>
              )}
            </div>
          </div>

          {forecast.status === 'insufficient_data' ? (
            <div className="card">
              <h2>{t('forecast.historyTitle')}</h2>
              <p className="empty">
                {insufficientReason} {t('forecast.insufficientNote')}
              </p>
              <DemandChart history={forecast.history} forecast={[]} />
            </div>
          ) : (
            <>
              <div className="card">
                <h2>{t('forecast.dailyDemand')}</h2>
                <p className="muted">{t('forecast.dailyNote', { count: forecast.forecast.length })}</p>
                <DemandChart history={forecast.history} forecast={forecast.forecast} />
              </div>

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
