// Bar chart of units sold per day (the last 30 days), followed by the model's predicted
// demand for the coming days. Drawn with the Recharts library.
//
// Charts always run left to right, also in Arabic (time going left to right is the normal
// convention in both languages), so the chart area is set to direction: ltr.
// The legend above the chart is normal HTML and follows the page direction.
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { useI18n } from '../../i18n/useI18n';

// history:  [{ date, quantity_sold }]  - past sales, one entry per day
// forecast: [{ date, predicted_demand }] - predicted demand for the next days
export default function DemandChart({ history, forecast, historyDays = 30 }) {
  const { t, formatDayMonth } = useI18n();

  // One entry per bar. A past day has `sold`; a future day has `predicted`.
  const recentHistory = history.slice(-historyDays);
  const bars = [];
  for (const day of recentHistory) {
    bars.push({ date: day.date, sold: Number(day.quantity_sold) });
  }
  for (const day of forecast) {
    bars.push({ date: day.date, predicted: Number(day.predicted_demand) });
  }

  if (bars.length === 0) {
    return <p className="empty">{t('chart.noSales')}</p>;
  }

  // The first predicted day: a dashed "today" line is drawn there
  const firstForecastDate = forecast.length > 0 && recentHistory.length > 0 ? forecast[0].date : null;

  // The text shown when hovering over a bar, e.g. "21 Sep: 5 units (predicted)"
  function tooltipText(value, seriesName, item) {
    const key = seriesName === 'predicted' ? 'chart.barTitlePredicted' : 'chart.barTitle';
    return [t(key, { date: formatDayMonth(item.payload.date), count: value }), null];
  }

  return (
    <figure className="chart">
      <figcaption className="chart__legend">
        <span><i className="chart__swatch chart__swatch--actual" aria-hidden="true" /> {t('chart.unitsSold')}</span>
        <span><i className="chart__swatch chart__swatch--predicted" aria-hidden="true" /> {t('chart.predicted')}</span>
      </figcaption>
      <div
        style={{ direction: 'ltr' }}
        role="img"
        aria-label={t('chart.demandAria', { history: recentHistory.length, forecast: forecast.length })}
      >
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={bars} margin={{ top: 14, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDayMonth}
              interval="preserveStartEnd"
              tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
              stroke="var(--color-border)"
            />
            <YAxis width={36} allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} stroke="none" />
            <Tooltip formatter={tooltipText} labelFormatter={() => ''} separator="" cursor={{ fill: 'var(--grid)' }} />
            {/* The two series share one slot per day: a day is either sold or predicted */}
            <Bar dataKey="sold" stackId="day" fill="var(--color-primary)" isAnimationActive={false} />
            <Bar dataKey="predicted" stackId="day" fill="var(--chart-2)" isAnimationActive={false} />
            {firstForecastDate && (
              <ReferenceLine
                x={firstForecastDate}
                stroke="var(--color-muted)"
                strokeDasharray="3 3"
                label={{ value: t('chart.today'), position: 'insideTopLeft', fontSize: 10, fill: 'var(--color-muted)' }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
