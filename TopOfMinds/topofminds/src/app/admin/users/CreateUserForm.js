'use client';

import { useActionState } from 'react';
import { createUserAction } from './actions';
import { ROLES, isSuperadmin } from '@/lib/auth/roles';

export default function CreateUserForm({ consultants, currentUserRole }) {
  const [state, action, pending] = useActionState(createUserAction, undefined);

  const freeConsultants = consultants.filter((c) => !c.user);

  return (
    <form action={action} className="ai-setting-card">
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Skapa användare</h3>

      <div className="ai-field">
        <label>Namn</label>
        <input type="text" name="name" required disabled={pending} />
      </div>
      <div className="ai-field">
        <label>E-post</label>
        <input type="email" name="email" required disabled={pending} />
      </div>
      <div className="ai-field">
        <label>Lösenord</label>
        <input type="password" name="password" minLength={8} required disabled={pending} />
      </div>
      <div className="ai-field">
        <label>Roll</label>
        <select name="role" defaultValue={ROLES.CONSULTANT} disabled={pending}>
          <option value={ROLES.CONSULTANT}>Konsult</option>
          <option value={ROLES.ADMIN}>Admin</option>
          {isSuperadmin(currentUserRole) && <option value={ROLES.SUPERADMIN}>Superadmin</option>}
        </select>
      </div>
      <div className="ai-field">
        <label>Konsultprofil (valfri)</label>
        <select name="consultantId" defaultValue="" disabled={pending}>
          <option value="">— Ingen —</option>
          {freeConsultants.map((c) => (
            <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
          ))}
        </select>
        <div className="ai-field-hint">Endast okopplade konsulter visas.</div>
      </div>

      {state?.message && <p className="auth-error auth-error-banner" style={{ marginTop: 10 }}>{state.message}</p>}
      {state?.ok && <p className="ai-saved" style={{ marginTop: 10 }}>✓ Användare skapad</p>}

      <div className="ai-setting-footer">
        <button type="submit" className="ai-save-btn" disabled={pending}>
          {pending ? 'Skapar…' : 'Skapa användare'}
        </button>
      </div>
    </form>
  );
}
