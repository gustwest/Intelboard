'use client';

import { useActionState } from 'react';
import { signup } from '@/lib/auth/actions';

export default function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <form action={action} className="auth-form">
      <div className="auth-field">
        <label htmlFor="name">Namn</label>
        <input id="name" name="name" type="text" autoComplete="name" required disabled={pending} />
        {state?.errors?.name && <p className="auth-error">{state.errors.name[0]}</p>}
      </div>

      <div className="auth-field">
        <label htmlFor="email">E-post</label>
        <input id="email" name="email" type="email" autoComplete="email" required disabled={pending} />
        {state?.errors?.email && <p className="auth-error">{state.errors.email[0]}</p>}
      </div>

      <div className="auth-field">
        <label htmlFor="password">Lösenord</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          disabled={pending}
        />
        {state?.errors?.password && (
          <ul className="auth-error-list">
            {state.errors.password.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        )}
      </div>

      {state?.message && <p className="auth-error auth-error-banner">{state.message}</p>}

      <button type="submit" className="auth-submit" disabled={pending}>
        {pending ? 'Skapar konto…' : 'Skapa konto'}
      </button>
    </form>
  );
}
