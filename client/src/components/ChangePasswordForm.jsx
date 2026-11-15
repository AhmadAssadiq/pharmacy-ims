// The "change password" card (GP2 addition), shown on the patient's account page and on
// the staff account page.
// The user types their current password and the new one twice. After the change they are
// signed out everywhere (the server refuses every older login token) and sent to the login
// page, where they sign in with the new password.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePasswordRequest } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/useI18n';
import constants from '../../../shared/constants.json';

const { PASSWORD_MIN_LENGTH } = constants;

const EMPTY_FORM = { current: '', next: '', repeat: '' };

export default function ChangePasswordForm() {
  const { logout } = useAuth();
  const { t, te } = useI18n();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Updates one field as the user types (the input's `name` says which)
  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    // Check the form here first, so the messages are in the user's language
    if (form.next.length < PASSWORD_MIN_LENGTH) {
      setError(t('password.tooShort', { count: PASSWORD_MIN_LENGTH }));
      return;
    }
    if (form.next !== form.repeat) {
      setError(t('password.mismatch'));
      return;
    }
    if (form.next === form.current) {
      setError(t('password.same'));
      return;
    }

    setSaving(true);
    try {
      await changePasswordRequest(form.current, form.next);
      // The server has signed this account out everywhere: sign out here too, and go to
      // the login page with a message
      logout();
      navigate('/login', { replace: true, state: { notice: 'password.changed' } });
    } catch (changeError) {
      // A wrong current password, for example: stay on the page and say why
      setError(te(changeError));
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} aria-labelledby="change-password">
      <h2 id="change-password">{t('password.title')}</h2>
      <p className="muted">{t('password.intro')}</p>

      {error && <div className="alert alert--error" role="alert">{error}</div>}

      <div className="form-grid">
        <label className="field">
          <span className="field__label">{t('password.current')}</span>
          <input
            name="current"
            type="password"
            value={form.current}
            onChange={handleChange}
            autoComplete="current-password"
            required
          />
        </label>
        <label className="field">
          <span className="field__label">{t('password.new', { count: PASSWORD_MIN_LENGTH })}</span>
          <input
            name="next"
            type="password"
            value={form.next}
            onChange={handleChange}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
          />
        </label>
        <label className="field">
          <span className="field__label">{t('password.repeat')}</span>
          <input
            name="repeat"
            type="password"
            value={form.repeat}
            onChange={handleChange}
            autoComplete="new-password"
            required
          />
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? t('common.saving') : t('password.submit')}
        </button>
      </div>
    </form>
  );
}
