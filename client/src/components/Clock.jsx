// The date and time in the top bar (GP2 addition). It shows minutes, not seconds, and only
// redraws when the minute changes.
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/useI18n';

const MS_PER_MINUTE = 60 * 1000;

const currentMinute = () => Math.floor(Date.now() / MS_PER_MINUTE);

const pad = (n) => String(n).padStart(2, '0');

/** Local date and time to the minute, as a valid `<time dateTime>` value. */
function toDateTimeAttr(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function Clock() {
  const { locale } = useI18n();
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
