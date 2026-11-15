// The notification bell in the top bar (GP2 addition).
// It shows a red number when something needs attention, and a small list when clicked:
//   staff:   reorder alerts, conversations with new messages, orders waiting
//   patient: new messages from the pharmacy, orders ready to collect, orders cancelled
//            because the prescription was rejected, medications that are back in stock
// Each line opens the page it is about.
//
// The counts always come from the server (GET /api/notifications). The bell asks again
// whenever the server says something changed (a 'notify' or 'message' event on the live
// connection), and once a minute as a fallback.
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clearWatchesBackInStock, fetchNotifications } from '../api/notifications';
import useChatSocket from '../hooks/useChatSocket';
import { useI18n } from '../i18n/useI18n';

const REFRESH_EVERY_MS = 60000; // 1 minute

export default function NotificationBell() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState({ items: [], total: 0 });
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Asks the server for the current notifications. If that fails, the bell keeps what it
  // has: a notification bell must never show an error of its own.
  async function loadNotifications() {
    try {
      setNotifications(await fetchNotifications());
    } catch {
      // keep the previous notifications
    }
  }

  // Load now, then again every minute (until the user signs out)
  useEffect(() => {
    loadNotifications();
    const timer = setInterval(loadNotifications, REFRESH_EVERY_MS);
    return () => clearInterval(timer);
  }, []);

  // Load again when the server says something changed, or a chat message arrives
  useChatSocket((event) => {
    if (event.type === 'notify' || event.type === 'message') {
      loadNotifications();
    }
  });

  // Close the list when another page opens
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // While the list is open: a click outside it, or the Escape key, closes it
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function handleClick(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleKey(event) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  // A line of the list was clicked: open its page
  async function openItem(item) {
    setOpen(false);
    // "Back in stock" has now been seen: stop watching those medications, so it goes away
    if (item.type === 'back_in_stock') {
      await clearWatchesBackInStock().catch(() => {});
      loadNotifications();
    }
    navigate(item.link);
  }

  // The sentence for one notification, e.g. "2 orders are ready to collect"
  function itemText(item) {
    if (item.type === 'back_in_stock') {
      return t('notifications.back_in_stock', { names: item.names.join(', ') });
    }
    return t(`notifications.${item.type}`, { count: item.count });
  }

  const { items, total } = notifications;
  const label = total > 0 ? t('notifications.bellLabel', { count: total }) : t('notifications.title');

  return (
    <div className="bell" ref={wrapperRef}>
      <button
        type="button"
        className="btn btn--ghost btn--icon bell__button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        {/* A bell */}
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
          <path
            d="M4.5 13V8a4.5 4.5 0 0 1 9 0v5l1.25 1.5H3.25L4.5 13zM7.25 16.25h3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {total > 0 && <span className="bell__count" aria-hidden="true">{total > 99 ? '99+' : total}</span>}
      </button>

      {open && (
        <div className="bell__panel" role="dialog" aria-label={t('notifications.title')}>
          <h2 className="bell__title">{t('notifications.title')}</h2>
          {items.length === 0 ? (
            <p className="empty">{t('notifications.none')}</p>
          ) : (
            <ul className="bell__list">
              {items.map((item) => (
                <li key={item.type}>
                  <button type="button" className="bell__item" onClick={() => openItem(item)}>
                    {itemText(item)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
