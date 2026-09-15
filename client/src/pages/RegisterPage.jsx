import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePathForRole } from '../utils/routes';

export default function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={homePathForRole(user.role)} replace />;

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const created = await register(form);
      navigate(homePathForRole(created.role), { replace: true });
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.details || {});
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-card__title">Create patient account</h1>
        <p className="muted">Check medication availability and chat with the pharmacy.</p>

        {error && <div className="alert alert--error" role="alert">{error}</div>}

        <label className="field">
          <span className="field__label">Full name</span>
          <input name="name" value={form.name} onChange={handleChange} required autoComplete="name" />
          {fieldErrors.name && <span className="field__error">{fieldErrors.name}</span>}
        </label>
        <label className="field">
          <span className="field__label">Email</span>
          <input name="email" type="email" value={form.email} onChange={handleChange} required autoComplete="email" />
          {fieldErrors.email && <span className="field__error">{fieldErrors.email}</span>}
        </label>
        <label className="field">
          <span className="field__label">Password (at least 8 characters)</span>
          <input name="password" type="password" value={form.password} onChange={handleChange} required minLength={8} autoComplete="new-password" />
          {fieldErrors.password && <span className="field__error">{fieldErrors.password}</span>}
        </label>

        <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? 'Creating account...' : 'Create account'}
        </button>

        <p className="muted auth-card__footer">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
