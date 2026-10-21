import { useI18n } from '../../i18n/I18nContext';

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 14, right: 10, bottom: 30, left: 36 };

/* Charts stay left to right in Arabic too: time running left to right is the
   convention for charts in both languages. `direction: ltr` on the <svg> also
   stops an RTL page from flipping every text-anchor. The legend is HTML and
   follows the page direction. */

/**
 * Daily units sold, with the model's predicted demand appended after today.
 * Plain SVG so the project keeps its dependency-free front end; each bar
 * carries a <title> for a native hover tooltip.
 */
export default function DemandChart({ history, forecast, historyDays = 30 }) {
  const { t, formatDayMonth } = useI18n();
  const recent = history.slice(-historyDays);
  const bars = [
    ...recent.map((row) => ({ date: row.date, value: Number(row.quantity_sold), predicted: false })),
    ...forecast.map((row) => ({ date: row.date, value: Number(row.predicted_demand), predicted: true })),
  ];

  if (bars.length === 0) return <p className="empty">{t('chart.noSales')}</p>;

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const max = Math.max(...bars.map((bar) => bar.value), 1);
  const step = plotWidth / bars.length;
  const barWidth = Math.max(step - 2, 1);
  const baseline = PAD.top + plotHeight;
  const y = (value) => baseline - (value / max) * plotHeight;
  const boundary = recent.length;

  const labels = [
    // The end labels anchor inward so a long month name ("تشرين الأول") never clips.
    { index: 0, text: formatDayMonth(bars[0].date), anchor: 'start', x: PAD.left },
    ...(boundary > 0 && boundary < bars.length
      ? [{ index: boundary, text: t('chart.today'), anchor: 'middle', x: PAD.left + boundary * step + barWidth / 2 }]
      : []),
    { index: bars.length - 1, text: formatDayMonth(bars[bars.length - 1].date), anchor: 'end', x: WIDTH - PAD.right },
  ];

  return (
    <figure className="chart">
      <figcaption className="chart__legend">
        <span><i className="chart__swatch chart__swatch--actual" aria-hidden="true" /> {t('chart.unitsSold')}</span>
        <span><i className="chart__swatch chart__swatch--predicted" aria-hidden="true" /> {t('chart.predicted')}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        style={{ direction: 'ltr' }}
        role="img"
        aria-label={t('chart.demandAria', { history: recent.length, forecast: forecast.length })}
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

        {bars.map((bar, index) => (
          <rect
            key={`${bar.date}-${index}`}
            x={PAD.left + index * step + 1}
            y={y(bar.value)}
            width={barWidth}
            height={Math.max(baseline - y(bar.value), 0)}
            fill={bar.predicted ? 'var(--chart-2)' : 'var(--color-primary)'}
          >
            <title>
              {t(bar.predicted ? 'chart.barTitlePredicted' : 'chart.barTitle', {
                date: formatDayMonth(bar.date),
                count: bar.value,
              })}
            </title>
          </rect>
        ))}

        {boundary > 0 && boundary < bars.length && (
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
          <text
            key={label.text}
            x={label.x}
            y={HEIGHT - 10}
            textAnchor={label.anchor}
            fontSize="10"
            fill="var(--color-muted)"
          >
            {label.text}
          </text>
        ))}
      </svg>
    </figure>
  );
}
