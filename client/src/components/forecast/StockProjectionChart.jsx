import { useI18n } from '../../i18n/I18nContext';

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 14, right: 46, bottom: 30, left: 36 };

/* Charts stay left to right in Arabic too: time running left to right is the
   convention for charts in both languages. `direction: ltr` on the <svg> also
   stops an RTL page from flipping every text-anchor. The legend is HTML and
   follows the page direction. */

/**
 * How the current stock is expected to run down over the forecast horizon, and
 * where it crosses the medication's reorder threshold - the calculation the
 * reorder alert itself is based on (FR 6.2).
 */
export default function StockProjectionChart({ currentQuantity, threshold, forecast, asOfDate }) {
  const { t, formatDayMonth } = useI18n();
  if (forecast.length === 0) return null;

  const points = [
    { date: asOfDate, stock: Number(currentQuantity) },
    ...forecast.map((row) => ({ date: row.date, stock: Number(row.projected_stock) })),
  ];

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const max = Math.max(...points.map((point) => point.stock), Number(threshold), 1);
  const step = plotWidth / Math.max(points.length - 1, 1);
  const baseline = PAD.top + plotHeight;
  const x = (index) => PAD.left + index * step;
  const y = (value) => baseline - (value / max) * plotHeight;
  const line = points.map((point, index) => `${x(index)},${y(point.stock)}`).join(' ');

  return (
    <figure className="chart">
      <figcaption className="chart__legend">
        <span><i className="chart__swatch chart__swatch--actual" aria-hidden="true" /> {t('chart.projectedStock')}</span>
        <span><i className="chart__swatch chart__swatch--threshold" aria-hidden="true" /> {t('chart.threshold')}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        style={{ direction: 'ltr' }}
        role="img"
        aria-label={t('chart.projectionAria', { quantity: currentQuantity, threshold })}
      >
        {[0, max / 2, max].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--grid)"
              strokeWidth="1"
            />
            <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" fontSize="10" fill="var(--color-muted)">
              {Math.round(tick)}
            </text>
          </g>
        ))}

        <line
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={y(threshold)}
          y2={y(threshold)}
          stroke="var(--color-danger)"
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />
        <text x={WIDTH - PAD.right + 4} y={y(threshold) + 4} fontSize="10" fill="var(--color-danger)">
          {threshold}
        </text>

        <polyline points={line} fill="none" stroke="var(--color-primary)" strokeWidth="2" />

        {points.map((point, index) => (
          <circle
            key={point.date}
            cx={x(index)}
            cy={y(point.stock)}
            r="3.5"
            fill={point.stock < threshold ? 'var(--color-danger)' : 'var(--color-primary)'}
          >
            <title>
              {t(point.stock < threshold ? 'chart.pointBelow' : 'chart.barTitle', {
                date: formatDayMonth(point.date),
                count: point.stock,
              })}
            </title>
          </circle>
        ))}

        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={baseline} y2={baseline} stroke="var(--color-border)" />

        <text x={PAD.left} y={HEIGHT - 10} textAnchor="start" fontSize="10" fill="var(--color-muted)">
          {t('chart.today')}
        </text>
        <text x={x(points.length - 1)} y={HEIGHT - 10} textAnchor="end" fontSize="10" fill="var(--color-muted)">
          {formatDayMonth(points[points.length - 1].date)}
        </text>
      </svg>
    </figure>
  );
}
