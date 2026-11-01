// Bar chart of units sold per month over the last two years, then the model's predicted
// demand for the next three months - the chart where the seasons show (GP2 addition).
// The current month stacks the sales so far under the prediction for the rest of it.
// Drawn with the Recharts library; always left to right, also in Arabic.
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { useI18n } from '../../i18n/useI18n';

// "2026-11" plus `count` months, e.g. addMonths('2026-11', 3) -> '2027-02'
function addMonths(month, count) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + count, 1));
  return date.toISOString().slice(0, 7);
}

// Adds up daily rows per month: { '2026-10': 152, '2026-11': 98, ... }
function totalPerMonth(rows, field) {
  const totals = {};
  for (const row of rows) {
    const month = String(row.date).slice(0, 7);
    totals[month] = (totals[month] || 0) + Number(row[field]);
  }
  return totals;
}

// history:   [{ date, quantity_sold }]     - past daily sales
// outlook:   [{ date, predicted_demand }]  - predicted daily demand for the next 3 months
// asOfDate:  today's date
export default function MonthlyChart({ history, outlook, asOfDate, historyMonths = 24 }) {
  const { t, formatMonthYear } = useI18n();
  const soldPerMonth = totalPerMonth(history, 'quantity_sold');
  const predictedPerMonth = totalPerMonth(outlook, 'predicted_demand');

  // The months to show: from 24 months ago (or the first sale, if later) to the last predicted month
  const currentMonth = asOfDate.slice(0, 7);
  const lastMonth = outlook.length > 0 ? String(outlook[outlook.length - 1].date).slice(0, 7) : currentMonth;
  let firstMonth = addMonths(currentMonth, 1 - historyMonths);
  if (history.length > 0 && String(history[0].date).slice(0, 7) > firstMonth) {
    firstMonth = String(history[0].date).slice(0, 7);
  }

  const bars = [];
  for (let month = firstMonth; month <= lastMonth; month = addMonths(month, 1)) {
    bars.push({
      month,
      sold: soldPerMonth[month] || 0,
      predicted: Math.round(predictedPerMonth[month] || 0),
    });
  }

  // The text shown when hovering over a month
  function tooltipLabel(month) {
    const bar = bars.find((item) => item.month === month);
    const monthName = formatMonthYear(month);
    if (month < currentMonth) {
      return t('chart.monthTitle', { month: monthName, count: bar.sold });
    }
    if (month > currentMonth) {
      return t('chart.monthTitlePredicted', { month: monthName, count: bar.predicted });
    }
    return t('chart.monthTitlePartial', { month: monthName, sold: bar.sold, predicted: bar.predicted });
  }

  return (
    <figure className="chart">
      <figcaption className="chart__legend">
        <span><i className="chart__swatch chart__swatch--actual" aria-hidden="true" /> {t('chart.unitsSold')}</span>
        {outlook.length > 0 && (
          <span><i className="chart__swatch chart__swatch--predicted" aria-hidden="true" /> {t('chart.predicted')}</span>
        )}
      </figcaption>
      <div
        style={{ direction: 'ltr' }}
        role="img"
        aria-label={t('chart.monthlyAria', { from: formatMonthYear(firstMonth), to: formatMonthYear(lastMonth) })}
      >
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={bars} margin={{ top: 14, right: 10, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthYear}
              interval="preserveStartEnd"
              tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
              stroke="var(--color-border)"
            />
            <YAxis width={44} allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} stroke="none" />
            <Tooltip
              labelFormatter={tooltipLabel}
              formatter={() => [null, null]}
              separator=""
              cursor={{ fill: 'var(--grid)' }}
            />
            {/* Sold (bottom) and predicted (top) are stacked in the same bar */}
            <Bar dataKey="sold" stackId="month" fill="var(--color-primary)" isAnimationActive={false} />
            <Bar dataKey="predicted" stackId="month" fill="var(--chart-2)" isAnimationActive={false} />
            <ReferenceLine
              x={currentMonth}
              stroke="var(--color-muted)"
              strokeDasharray="3 3"
              label={{ value: t('chart.thisMonth'), position: 'insideTopLeft', fontSize: 10, fill: 'var(--color-muted)' }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
