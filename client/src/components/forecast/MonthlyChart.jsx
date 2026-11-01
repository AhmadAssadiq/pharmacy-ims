import { useI18n } from '../../i18n/I18nContext';

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 14, right: 10, bottom: 30, left: 44 };

/* Left to right in Arabic too, like the other forecast charts (see DemandChart). */

/** "2026-11" plus `count` months. */
function addMonths(month, count) {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + count, 1));
  return date.toISOString().slice(0, 7);
}

function sumByMonth(rows, field) {
  const totals = new Map();
  for (const row of rows) {
    const month = String(row.date).slice(0, 7);
    totals.set(month, (totals.get(month) || 0) + Number(row[field]));
  }
  return totals;
}

/**
 * Units sold per month over the last `historyMonths` months, then the model's
 * predicted demand for the months ahead (GP2 addition) - where the seasons
 * show. The current month stacks the sales so far under the prediction for the
 * rest of it.
 */
export default function MonthlyChart({ history, outlook, asOfDate, historyMonths = 24 }) {
  const { t, formatMonthYear } = useI18n();
  const actual = sumByMonth(history, 'quantity_sold');
  const predicted = sumByMonth(outlook, 'predicted_demand');

  const current = asOfDate.slice(0, 7);
  const lastMonth = outlook.length ? String(outlook[outlook.length - 1].date).slice(0, 7) : current;
  const windowStart = addMonths(current, 1 - historyMonths);
  const firstSale = history.length ? String(history[0].date).slice(0, 7) : current;
  const bars = [];
  for (let month = firstSale > windowStart ? firstSale : windowStart; month <= lastMonth; month = addMonths(month, 1)) {
    bars.push({ month, actual: actual.get(month) || 0, predicted: Math.round(predicted.get(month) || 0) });
  }

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const max = Math.max(...bars.map((bar) => bar.actual + bar.predicted), 1);
  const step = plotWidth / bars.length;
  const barWidth = Math.max(step - 3, 1);
  const baseline = PAD.top + plotHeight;
  const y = (value) => baseline - (value / max) * plotHeight;
  const boundary = bars.findIndex((bar) => bar.month === current);

  const title = (bar) => {
    const month = formatMonthYear(bar.month);
    if (bar.month < current) return t('chart.monthTitle', { month, count: bar.actual });
    if (bar.month > current) return t('chart.monthTitlePredicted', { month, count: bar.predicted });
    return t('chart.monthTitlePartial', { month, sold: bar.actual, predicted: bar.predicted });
  };

  const labels = [
    { text: formatMonthYear(bars[0].month), anchor: 'start', x: PAD.left },
    ...(boundary > 0 && boundary < bars.length - 1
      ? [{ text: t('chart.thisMonth'), anchor: 'middle', x: PAD.left + boundary * step + barWidth / 2 }]
      : []),
    { text: formatMonthYear(bars[bars.length - 1].month), anchor: 'end', x: WIDTH - PAD.right },
  ];

  return (
    <figure className="chart">
      <figcaption className="chart__legend">
        <span><i className="chart__swatch chart__swatch--actual" aria-hidden="true" /> {t('chart.unitsSold')}</span>
        {outlook.length > 0 && (
          <span><i className="chart__swatch chart__swatch--predicted" aria-hidden="true" /> {t('chart.predicted')}</span>
        )}
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        style={{ direction: 'ltr' }}
        role="img"
        aria-label={t('chart.monthlyAria', { from: labels[0].text, to: labels[labels.length - 1].text })}
      >
        {[0, max / 2, max].map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--grid)" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" fontSize="10" fill="var(--color-muted)">
              {Math.round(tick)}
            </text>
          </g>
        ))}

        {bars.map((bar, index) => {
          const x = PAD.left + index * step + 1.5;
          return (
            <g key={bar.month}>
              <title>{title(bar)}</title>
              <rect
                x={x}
                y={y(bar.actual)}
                width={barWidth}
                height={Math.max(baseline - y(bar.actual), 0)}
                fill="var(--color-primary)"
              />
              <rect
                x={x}
                y={y(bar.actual + bar.predicted)}
                width={barWidth}
                height={Math.max(y(bar.actual) - y(bar.actual + bar.predicted), 0)}
                fill="var(--chart-2)"
              />
            </g>
          );
        })}

        {boundary > 0 && (
          <line
            x1={PAD.left + boundary * step}
            x2={PAD.left + boundary * step}
            y1={PAD.top}
            y2={baseline}
            stroke="var(--color-muted)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={baseline} y2={baseline} stroke="var(--color-border)" />

        {labels.map((label) => (
          <text key={label.text} x={label.x} y={HEIGHT - 10} textAnchor={label.anchor} fontSize="10" fill="var(--color-muted)">
            {label.text}
          </text>
        ))}
      </svg>
    </figure>
  );
}
