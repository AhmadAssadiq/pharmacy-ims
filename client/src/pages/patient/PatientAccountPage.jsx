import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteAccountRequest } from '../../api/auth';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

/**
 * The patient's account (GP2 addition): who they are signed in as, and the
 * one destructive action, deleting the account. The password is asked for on
 * the page and the deletion confirmed in a dialog that says what goes.
 * Afterwards the session is cleared and the patient lands on the login page.
 */
export default function PatientAccountPage() {
  const { user, logout } = useAuth();
  const { t, te } = useI18n();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const errorRef = useRef(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const handleRequest = (e) => {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError(t('account.passwordRequired'));
      return;
    }
    setConfirming(true);
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await deleteAccountRequest(password);
      logout();
      navigate('/login', { replace: true, state: { notice: 'account.deleted' } });
    } catch (err) {
      setConfirming(false);
      setPassword('');
      setError(te(err));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>{t('account.title')}</h1>
      </div>

      <section className="card" aria-labelledby="account-details">
        <h2 id="account-details">{t('account.details')}</h2>
        <div className="stock-summary">
          <div>
            <span className="field__label">{t('auth.fullName')}</span>
            <strong><bdi>{user.name}</bdi></strong>
          </div>
          <div>
            <span className="field__label">{t('auth.email')}</span>
            <strong dir="ltr">{user.email}</strong>
          </div>
        </div>
      </section>

      <form className="card card--danger" onSubmit={handleRequest} aria-labelledby="delete-account">
        <h2 id="delete-account">{t('account.deleteTitle')}</h2>
        <p>{t('account.deleteIntro')}</p>
        <ul className="danger-list">
          <li>{t('account.erasesChat')}</li>
          <li>{t('account.erasesPreorders')}</li>
          <li>{t('account.erasesImages')}</li>
          <li>{t('account.erasesAccount')}</li>
        </ul>
        <p className="muted">{t('account.cannotUndo')}</p>

        {error && (
          <div className="alert alert--error" role="alert" tabIndex={-1} ref={errorRef}>
            {error}
          </div>
        )}

        <div className="form-grid">
          <label className="field">
            <span className="field__label">{t('account.confirmPassword')}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn--danger">
            {t('account.deleteButton')}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={confirming}
        title={t('account.confirmTitle')}
        lead={t('account.confirmLead')}
        confirmLabel={t('account.confirmButton')}
        cancelLabel={t('account.keep')}
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={handleDelete}
      />
    </>
  );
}
