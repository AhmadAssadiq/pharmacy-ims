import { useEffect, useMemo, useState } from 'react';

const MS_PER_MINUTE = 60 * 1000;

const currentMinute = () => Math.floor(Date.now() / MS_PER_MINUTE);

const pad = (n) => String(n).padStart(2, '0');

/** Local date and time to the minute, as a valid `<time dateTime>` value. */
function toDateTimeAttr(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Live date and time for the top bar (GP2 addition).
 *
 * It shows minutes, not seconds: a pharmacist needs the date and the time of
 * day, and a ticking seconds digit would be the only moving thing on a screen
 * that is otherwise still. The one interval runs every second so the minute
 * turns over on time, but the state holds only the current minute, so React
 * skips the 59 ticks that change nothing and re-renders this component alone,
 * never the page under it. No aria-live: screen readers read it on demand.
 */
export default function Clock({ locale }) {
  const [minute, setMinute] = useState(currentMinute);

  useEffect(() => {
    const id = setInterval(() => setMinute(currentMinute()), 1000);
    return () => clearInterval(id);
  }, []);

  const formats = useMemo(
    () => ({
      date: new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }),
      time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
    }),
    [locale]
  );

  const now = new Date(minute * MS_PER_MINUTE);

  return (
    <time className="topbar__clock" dateTime={toDateTimeAttr(now)}>
      <span className="topbar__time num">{formats.time.format(now)}</span>
      <span className="topbar__date num">{formats.date.format(now)}</span>
    </time>
  );
}
