// Line chart of how the current stock is expected to run down over the forecast days,
// with the medication's reorder threshold as a dashed red line (FR 6.2). This is exactly the
// calculation the reorder alert is based on. Drawn with the Recharts library.
// Points below the threshold are drawn red.
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { useI18n } from '../../i18n/useI18n';

// currentQuantity: units in stock now
// threshold:       the reorder threshold
// forecast:        [{ date, projected_stock }] - stock left at the end of each future day
// asOfDate:        today's date (the first point of the line)
export default function StockProjectionChart({ currentQuantity, threshold, forecast, asOfDate }) {
  const { t, formatDayMonth } = useI18n();
  if (forecast.length === 0) {
    return null;
  }

  // The line starts with today's stock, then one point per forecast day
  const points = [{ date: asOfDate, stock: Number(currentQuantity) }];
  for (const day of forecast) {
    points.push({ date: day.date, stock: Number(day.projected_stock) });
  }

  // Draws one point of the line: red when the stock is below the threshold
  function StockPoint({ cx, cy, payload }) {
    const color = payload.stock < threshold ? 'var(--color-danger)' : 'var(--color-primary)';
    return <circle key={payload.date} cx={cx} cy={cy} r={3.5} fill={color} />;
  }

  // The text shown when hovering over a point, e.g. "21 Sep: 12 units (below threshold)"
  function tooltipText(value, seriesName, item) {
    const key = value < threshold ? 'chart.pointBelow' : 'chart.barTitle';
    return [t(key, { date: formatDayMonth(item.payload.date), count: value }), null];
  }

  // The first point is labelled "today" instead of a date
  function xAxisLabel(date) {
    return date === asOfDate ? t('chart.today') : formatDayMonth(date);
  }

  return (
    <figure className="chart">
      <figcaption className="chart__legend">
        <span><i className="chart__swatch chart__swatch--actual" aria-hidden="true" /> {t('chart.projectedStock')}</span>
        <span><i className="chart__swatch chart__swatch--threshold" aria-hidden="true" /> {t('chart.threshold')}</span>
      </figcaption>
      <div
        style={{ direction: 'ltr' }}
        role="img"
        aria-label={t('chart.projectionAria', { quantity: currentQuantity, threshold })}
      >
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={points} margin={{ top: 14, right: 46, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="date"
              tickFormatter={xAxisLabel}
              interval="preserveStartEnd"
              tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
              stroke="var(--color-border)"
            />
            <YAxis width={36} domain={[0, 'auto']} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} stroke="none" />
            <Tooltip formatter={tooltipText} labelFormatter={() => ''} separator="" />
            <ReferenceLine
              y={threshold}
              stroke="var(--color-danger)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              label={{ value: threshold, position: 'right', fontSize: 10, fill: 'var(--color-danger)' }}
            />
            <Line
              dataKey="stock"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={StockPoint}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
