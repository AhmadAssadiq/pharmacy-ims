const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 14, right: 10, bottom: 30, left: 36 };

/**
 * Daily units sold, with the model's predicted demand appended after today.
 * Plain SVG so the project keeps its dependency-free front end; each bar
 * carries a <title> for a native hover tooltip.
 */
export default function DemandChart({ history, forecast, historyDays = 30 }) {
  const recent = history.slice(-historyDays);
  const bars = [
    ...recent.map((row) => ({ date: row.date, value: Number(row.quantity_sold), predicted: false })),
    ...forecast.map((row) => ({ date: row.date, value: Number(row.predicted_demand), predicted: true })),
  ];

  if (bars.length === 0) return <p className="empty">No sales recorded for this medication yet.</p>;

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const max = Math.max(...bars.map((bar) => bar.value), 1);
  const step = plotWidth / bars.length;
  const barWidth = Math.max(step - 2, 1);
  const baseline = PAD.top + plotHeight;
  const y = (value) => baseline - (value / max) * plotHeight;
  const boundary = recent.length;

  const labels = [
    { index: 0, text: bars[0].date.slice(5) },
    ...(boundary > 0 && boundary < bars.length ? [{ index: boundary, text: 'today' }] : []),
    { index: bars.length - 1, text: bars[bars.length - 1].date.slice(5) },
  ];

  return (
    <figure className="chart">
      <figcaption className="chart__legend">
        <span><i className="chart__swatch chart__swatch--actual" aria-hidden="true" /> Units sold</span>
        <span><i className="chart__swatch chart__swatch--predicted" aria-hidden="true" /> Predicted demand</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        role="img"
        aria-label={`Daily units sold over the last ${recent.length} days, followed by ${forecast.length} days of predicted demand`}
      >
        {[0, max / 2, max].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--color-border)"
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
            fill={bar.predicted ? 'var(--color-warning)' : 'var(--color-primary)'}
            opacity={bar.predicted ? 0.8 : 1}
          >
            <title>{`${bar.date}: ${bar.value} units${bar.predicted ? ' (predicted)' : ''}`}</title>
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
            x={PAD.left + label.index * step + barWidth / 2}
            y={HEIGHT - 10}
            textAnchor="middle"
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
