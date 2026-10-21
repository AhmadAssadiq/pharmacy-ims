import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { homePathForRole } from '../utils/routes';

export default function LoginPage() {
  const { user, login } = useAuth();
  const { t, te } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
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
    setSubmitting(true);
    try {
      const signedIn = await login(form);
      navigate(location.state?.from || homePathForRole(signedIn.role), { replace: true });
    } catch (err) {
      setError(te(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="card auth-card" onSubmit={handleSubmit}>
      <h1 className="auth-card__title">{t('auth.loginTitle')}</h1>
      <p className="muted">{t('auth.loginSubtitle')}</p>

      {error && (
        <div className="alert alert--error" role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </div>
      )}

      <label className="field">
        <span className="field__label">{t('auth.email')}</span>
        <input name="email" type="email" dir="ltr" value={form.email} onChange={handleChange} required autoComplete="email" />
      </label>
      <label className="field">
        <span className="field__label">{t('auth.password')}</span>
        <input name="password" type="password" value={form.password} onChange={handleChange} required autoComplete="current-password" />
      </label>

      <button type="submit" className="btn btn--primary btn--block" aria-disabled={submitting}>
        {submitting ? t('auth.signingIn') : t('auth.signIn')}
      </button>

      <p className="muted auth-card__footer">
        {t('auth.newPatient')} <Link to="/register">{t('auth.createAccountLink')}</Link>
      </p>
    </form>
  );
}
