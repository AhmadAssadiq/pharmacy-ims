import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { homePathForRole } from '../utils/routes';
import { normalisePhone } from '../utils/phone';
import constants from '../../../shared/constants.json';

const { PASSWORD_MIN_LENGTH } = constants;

export default function RegisterPage() {
  const { user, register } = useAuth();
  const { t, te } = useI18n();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const errorRef = useRef(null);

  // The submit button is aria-disabled rather than disabled while the request is
  // in flight, because a disabled button drops keyboard focus to the page body.
  // On failure, focus moves to the error.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  if (user) return <Navigate to={homePathForRole(user.role)} replace />;

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setFieldErrors({});
    const phone = normalisePhone(form.phone);
    if (phone.error) {
      setFieldErrors({ phone: t(`phone.${phone.error}`) });
      return;
    }
    setSubmitting(true);
    try {
      const created = await register(form);
      navigate(homePathForRole(created.role), { replace: true });
    } catch (err) {
      setError(te(err));
      setFieldErrors(err.details || {});
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="card auth-card" onSubmit={handleSubmit}>
      <h1 className="auth-card__title">{t('auth.registerTitle')}</h1>
      <p className="muted">{t('auth.registerSubtitle')}</p>

      {error && (
        <div className="alert alert--error" role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </div>
      )}

      <label className="field">
        <span className="field__label">{t('auth.fullName')}</span>
        <input name="name" value={form.name} onChange={handleChange} required autoComplete="name" />
        {fieldErrors.name && <span className="field__error">{fieldErrors.name}</span>}
      </label>
      <label className="field">
        <span className="field__label">{t('auth.email')}</span>
        <input name="email" type="email" dir="ltr" value={form.email} onChange={handleChange} required autoComplete="email" />
        {fieldErrors.email && <span className="field__error">{fieldErrors.email}</span>}
      </label>
      <label className="field">
        <span className="field__label">{t('phone.label')}</span>
        <input
          name="phone"
          type="tel"
          dir="ltr"
          value={form.phone}
          onChange={handleChange}
          required
          autoComplete="tel"
          aria-describedby="phone-hint"
          aria-invalid={fieldErrors.phone ? 'true' : undefined}
        />
        <span className="field__hint" id="phone-hint">{t('phone.hint')}</span>
        {fieldErrors.phone && <span className="field__error">{fieldErrors.phone}</span>}
      </label>
      <label className="field">
        <span className="field__label">{t('auth.passwordHint', { count: PASSWORD_MIN_LENGTH })}</span>
        <input name="password" type="password" value={form.password} onChange={handleChange} required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" />
        {fieldErrors.password && <span className="field__error">{fieldErrors.password}</span>}
      </label>

      <button type="submit" className="btn btn--primary btn--block" aria-disabled={submitting}>
        {submitting ? t('auth.creatingAccount') : t('auth.createAccount')}
      </button>

      <p className="muted auth-card__footer">
        {t('auth.alreadyRegistered')} <Link to="/login">{t('auth.signInLink')}</Link>
      </p>
    </form>
  );
}
