import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPasswordRequest } from '../api/auth';
import { useI18n } from '../i18n/I18nContext';
import constants from '../../../shared/constants.json';

/**
 * Forgot password (GP2 addition). Whatever the email, the page says the same
 * thing afterwards, so it never tells anyone which addresses have accounts.
 */
export default function ForgotPasswordPage() {
  const { t, te } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const errorRef = useRef(null);
  const sentRef = useRef(null);

  // As on Login: the button stays focusable while busy, and focus moves to the outcome.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (sent) sentRef.current?.focus();
  }, [sent]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await forgotPasswordRequest(email);
      setSent(true);
    } catch (err) {
      setError(te(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="card auth-card">
        <h1 className="auth-card__title">{t('reset.forgotTitle')}</h1>
        <div className="alert alert--success" role="status" tabIndex={-1} ref={sentRef}>
          {t('reset.sent', { minutes: constants.PASSWORD_RESET_MINUTES })}
        </div>
        <p className="muted auth-card__footer">
          <Link to="/login">{t('reset.backToLogin')}</Link>
        </p>
      </div>
    );
  }

  return (
    <form className="card auth-card" onSubmit={handleSubmit}>
      <h1 className="auth-card__title">{t('reset.forgotTitle')}</h1>
      <p className="muted">{t('reset.forgotSubtitle')}</p>

      {error && (
        <div className="alert alert--error" role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </div>
      )}

      <label className="field">
        <span className="field__label">{t('auth.email')}</span>
        <input
          name="email"
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </label>

      <button type="submit" className="btn btn--primary btn--block" aria-disabled={submitting}>
        {submitting ? t('reset.sending') : t('reset.sendLink')}
      </button>

      <p className="muted auth-card__footer">
        <Link to="/login">{t('reset.backToLogin')}</Link>
      </p>
    </form>
  );
}
