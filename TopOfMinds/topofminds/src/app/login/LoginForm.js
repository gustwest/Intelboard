'use client';

import { useActionState } from 'react';
import { login } from '@/lib/auth/actions';

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="auth-form">
      <div className="auth-field">
        <label htmlFor="email">E-post</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
        />
        {state?.errors?.email && <p className="auth-error">{state.errors.email[0]}</p>}
      </div>

      <div className="auth-field">
        <label htmlFor="password">Lösenord</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
        />
        {state?.errors?.password && <p className="auth-error">{state.errors.password[0]}</p>}
      </div>

      {state?.message && <p className="auth-error auth-error-banner">{state.message}</p>}

      <button type="submit" className="auth-submit" disabled={pending}>
        {pending ? 'Loggar in…' : 'Logga in'}
      </button>
    </form>
  );
}
