import LoginForm from './LoginForm';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/dal';
import { ROLES } from '@/lib/auth/roles';

export const metadata = {
  title: 'Logga in — TopOfMinds',
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(user.role === ROLES.CONSULTANT ? '/my' : '/');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || '';

  return (
    <>
      <meta name="google-client-id" content={clientId} />
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">T</div>
          <span className="auth-logo-text">TopOfMinds</span>
        </div>
        <h1 className="auth-title">Logga in</h1>
        <p className="auth-subtitle">Välkommen tillbaka. Logga in med ditt Google-konto.</p>

        <LoginForm />
      </div>
    </>
  );
}
