// The staff member's account page (GP2 addition): who they are signed in as, and
// changing their password. (Staff accounts are created by the pharmacy, so unlike a
// patient, a staff member cannot delete their own account here.)
import ChangePasswordForm from '../../components/ChangePasswordForm';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/useI18n';

export default function StaffAccountPage() {
  const { user } = useAuth();
  const { t } = useI18n();

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
          <div>
            <span className="field__label">{t('account.role')}</span>
            <strong>{t('nav.roleStaff')}</strong>
          </div>
        </div>
      </section>

      <ChangePasswordForm />
    </>
  );
}
