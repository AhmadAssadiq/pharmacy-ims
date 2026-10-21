import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPasswordRequest } from '../api/auth';
import { useI18n } from '../i18n/I18nContext';
import constants from '../../../shared/constants.json';

const { PASSWORD_MIN_LENGTH } = constants;

/**
 * Choose a new password from a reset link (GP2 addition). The token is read
 * once from ?token= and then removed from the address bar, so it does not stay
 * in the browser history. Success goes to the login page; it never signs in.
 */
export default function ResetPasswordPage() {
  const { t, te } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get('token') || '');
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const errorRef = useRef(null);

  useEffect(() => {
    if (searchParams.has('token')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setFieldErrors({});
    if (form.password !== form.confirm) {
      setFieldErrors({ confirm: t('reset.mismatch') });
      return;
    }
    setSubmitting(true);
    try {
      await resetPasswordRequest({ token, password: form.password });
      navigate('/login', { replace: true, state: { notice: 'reset.done' } });
    } catch (err) {
      setError(te(err));
      setFieldErrors(err.details || {});
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="card auth-card">
        <h1 className="auth-card__title">{t('reset.resetTitle')}</h1>
        <div className="alert alert--error" role="alert">{t('errors.RESET_TOKEN_INVALID')}</div>
        <p className="muted auth-card__footer">
          <Link to="/forgot-password">{t('reset.requestNew')}</Link>
        </p>
      </div>
    );
  }

  return (
    <form className="card auth-card" onSubmit={handleSubmit}>
      <h1 className="auth-card__title">{t('reset.resetTitle')}</h1>
      <p className="muted">{t('reset.resetSubtitle')}</p>

      {error && (
        <div className="alert alert--error" role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </div>
      )}

      <label className="field">
        <span className="field__label">{t('auth.passwordHint', { count: PASSWORD_MIN_LENGTH })}</span>
        <input
          name="password"
          type="password"
          value={form.password}
          onChange={handleChange}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
        />
        {fieldErrors.password && <span className="field__error">{fieldErrors.password}</span>}
      </label>
      <label className="field">
        <span className="field__label">{t('reset.confirmPassword')}</span>
        <input
          name="confirm"
          type="password"
          value={form.confirm}
          onChange={handleChange}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          aria-invalid={fieldErrors.confirm ? 'true' : undefined}
        />
        {fieldErrors.confirm && <span className="field__error">{fieldErrors.confirm}</span>}
      </label>

      <button type="submit" className="btn btn--primary btn--block" aria-disabled={submitting}>
        {submitting ? t('reset.saving') : t('reset.save')}
      </button>

      <p className="muted auth-card__footer">
        <Link to="/forgot-password">{t('reset.requestNew')}</Link>
      </p>
    </form>
  );
}
