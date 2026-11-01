// The patient's account page (GP2 addition):
//   - who they are signed in as,
//   - their phone number (the pharmacy phones when a preorder is ready),
//   - deleting the account: they type their password, then confirm in a dialog that says
//     what will be deleted. Afterwards they are signed out and sent to the login page.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteAccountRequest, updatePhoneRequest } from '../../api/auth';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/useI18n';
import { normalisePhone } from '../../utils/phone';

export default function PatientAccountPage() {
  const { user, logout, updateUser } = useAuth();
  const { t, te } = useI18n();
  const navigate = useNavigate();

  // Phone number form
  const [phone, setPhone] = useState(user.phone ?? '');
  const [phoneError, setPhoneError] = useState(null);
  const [phoneNotice, setPhoneNotice] = useState(null);
  const [savingPhone, setSavingPhone] = useState(false);

  // Delete account form
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const errorRef = useRef(null);

  // When an error appears, move the keyboard focus to it
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  async function handleSavePhone(event) {
    event.preventDefault();
    setPhoneError(null);
    setPhoneNotice(null);

    // Check the number here first, so the message is in the patient's language
    const check = normalisePhone(phone);
    if (check.error) {
      setPhoneError(t(`phone.${check.error}`));
      return;
    }

    setSavingPhone(true);
    try {
      const result = await updatePhoneRequest(check.value);
      updateUser(result.user);
      setPhone(result.user.phone);
      setPhoneNotice(t('phone.saved'));
    } catch (saveError) {
      if (saveError.details && saveError.details.phone) {
        setPhoneError(saveError.details.phone);
      } else {
        setPhoneError(te(saveError));
      }
    } finally {
      setSavingPhone(false);
    }
  }

  // "Delete my account" pressed: the password must be typed, then the dialog opens
  function handleDeleteRequest(event) {
    event.preventDefault();
    setError(null);
    if (!password) {
      setError(t('account.passwordRequired'));
      return;
    }
    setConfirming(true);
  }

  // Confirmed in the dialog: delete the account, sign out, go to the login page
  async function handleDelete() {
    setBusy(true);
    try {
      await deleteAccountRequest(password);
      logout();
      navigate('/login', { replace: true, state: { notice: 'account.deleted' } });
    } catch (deleteError) {
      // Wrong password, for example: close the dialog and show why
      setConfirming(false);
      setPassword('');
      setError(te(deleteError));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>{t('account.title')}</h1>
      </div>

      {/* Who they are */}
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

      {/* Phone number (the id lets the "add your phone" links jump here) */}
      <form className="card" id="phone" onSubmit={handleSavePhone} aria-labelledby="phone-heading">
        <h2 id="phone-heading">{t('phone.title')}</h2>
        <p className="muted">{t('phone.why')}</p>
        {phoneNotice && <div className="alert alert--success" role="status">{phoneNotice}</div>}
        <div className="form-grid">
          <label className="field">
            <span className="field__label">{t('phone.label')}</span>
            <input
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              required
              aria-invalid={phoneError ? 'true' : undefined}
              aria-describedby="account-phone-hint"
            />
            <span className="field__hint" id="account-phone-hint">{t('phone.hint')}</span>
            {phoneError && <span className="field__error" role="alert">{phoneError}</span>}
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={savingPhone}>
            {savingPhone ? t('common.saving') : t('phone.save')}
          </button>
        </div>
      </form>

      {/* Delete the account */}
      <form className="card card--danger" onSubmit={handleDeleteRequest} aria-labelledby="delete-account">
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
              onChange={(event) => setPassword(event.target.value)}
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
