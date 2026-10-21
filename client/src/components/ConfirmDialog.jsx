import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n/I18nContext';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal confirmation for an action that cannot be undone.
 *
 * Keyboard behaviour is the whole point of a gate like this: Escape cancels,
 * Tab is trapped inside, focus lands on Cancel rather than on the commit
 * button so a stray Enter does nothing, and focus returns to whatever opened
 * the dialog when it closes.
 */
export default function ConfirmDialog({
  open,
  title,
  lead,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
  children,
}) {
  const { t } = useI18n();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const openerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement;
    cancelRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = dialogRef.current?.querySelectorAll(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      // Put the keyboard back where it was before the dialog opened.
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        ref={dialogRef}
      >
        <h2 id="confirm-title">{title}</h2>
        {lead && <p className="modal__lead">{lead}</p>}
        {children}
        <div className="modal__actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy} ref={cancelRef}>
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button type="button" className="btn btn--commit" onClick={onConfirm} disabled={busy}>
            {busy ? t('common.working') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
