import SignupForm from './SignupForm';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/dal';
import { ROLES } from '@/lib/auth/roles';

export const metadata = {
  title: 'Skapa konto — TopOfMinds',
};

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(user.role === ROLES.CONSULTANT ? '/my' : '/');
  }

  return (
    <div className="auth-card">
      <div className="auth-logo">
        <div className="auth-logo-icon">T</div>
        <span className="auth-logo-text">TopOfMinds</span>
      </div>
      <h1 className="auth-title">Skapa konto</h1>
      <p className="auth-subtitle">
        Använd den e-post som finns på din konsultprofil så kopplas kontot automatiskt.
      </p>

      <SignupForm />

      <p className="auth-footer">
        Har du redan ett konto? <Link href="/login">Logga in</Link>
      </p>
    </div>
  );
}
