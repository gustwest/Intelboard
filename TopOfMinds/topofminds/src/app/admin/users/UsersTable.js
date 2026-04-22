'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateUserAction, resetPasswordAction } from './actions';
import { ROLES, isSuperadmin } from '@/lib/auth/roles';

function formData(obj) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    if (v != null) fd.append(k, String(v));
  }
  return fd;
}

export default function UsersTable({ users, consultants, currentUserId, currentUserRole }) {
  const [isPending, startTransition] = useTransition();
  const [pwResetFor, setPwResetFor] = useState(null);
  const [message, setMessage] = useState(null);
  const router = useRouter();

  const availableConsultants = (targetUserId) =>
    consultants.filter((c) => !c.user || c.user.id === targetUserId);

  const update = (userId, changes) => {
    setMessage(null);
    startTransition(async () => {
      const res = await updateUserAction(undefined, formData({ userId, ...changes }));
      if (res?.ok) router.refresh();
      else setMessage(res?.message || 'Kunde inte uppdatera.');
    });
  };

  return (
    <div className="ai-models-table-wrap">
      {message && <div className="auth-error auth-error-banner" style={{ margin: 12 }}>{message}</div>}
      <table className="ai-models-table">
        <thead>
          <tr>
            <th>Användare</th>
            <th>Roll</th>
            <th>Konsultprofil</th>
            <th>Senast inloggad</th>
            <th>Aktiv</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isSelf = u.id === currentUserId;
            const targetIsSuperadmin = u.role === ROLES.SUPERADMIN;
            const canEditRole = !targetIsSuperadmin || isSuperadmin(currentUserRole);

            return (
              <tr key={u.id} className={u.isActive ? '' : 'ai-model-disabled'}>
                <td>
                  <div className="ai-model-name">{u.name || '—'}</div>
                  <div className="ai-model-id">{u.email}</div>
                </td>
                <td>
                  <select
                    defaultValue={u.role}
                    disabled={isPending || !canEditRole || isSelf}
                    onChange={(e) => update(u.id, { role: e.target.value })}
                    className="inline-select"
                  >
                    {isSuperadmin(currentUserRole) && <option value={ROLES.SUPERADMIN}>Superadmin</option>}
                    <option value={ROLES.ADMIN}>Admin</option>
                    <option value={ROLES.CONSULTANT}>Konsult</option>
                  </select>
                </td>
                <td>
                  <select
                    defaultValue={u.consultantId || ''}
                    disabled={isPending}
                    onChange={(e) => update(u.id, { consultantId: e.target.value })}
                    className="inline-select"
                  >
                    <option value="">— Ingen koppling —</option>
                    {availableConsultants(u.id).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.firstName} {c.lastName}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('sv-SE') : 'Aldrig'}</td>
                <td>
                  <label className="users-toggle">
                    <input
                      type="checkbox"
                      defaultChecked={u.isActive}
                      disabled={isPending || isSelf}
                      onChange={(e) => update(u.id, { isActive: e.target.checked })}
                    />
                    <span>{u.isActive ? 'Aktiv' : 'Inaktiv'}</span>
                  </label>
                </td>
                <td>
                  <button
                    type="button"
                    className="ai-toggle-btn"
                    onClick={() => setPwResetFor(pwResetFor === u.id ? null : u.id)}
                  >
                    {pwResetFor === u.id ? 'Avbryt' : 'Sätt lösenord'}
                  </button>
                  {pwResetFor === u.id && (
                    <PasswordResetInline
                      userId={u.id}
                      onDone={() => {
                        setPwResetFor(null);
                        router.refresh();
                      }}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PasswordResetInline({ userId, onDone }) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);

  return (
    <form
      action={(fd) => {
        fd.append('userId', userId);
        startTransition(async () => {
          const res = await resetPasswordAction(undefined, fd);
          if (res?.ok) { setMsg('Lösenord sparat.'); setTimeout(onDone, 900); }
          else setMsg(res?.message || 'Fel');
        });
      }}
      style={{ display: 'inline-flex', gap: 6, marginLeft: 8 }}
    >
      <input
        type="password"
        name="newPassword"
        minLength={8}
        required
        placeholder="Minst 8 tecken"
        autoComplete="new-password"
        style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '5px 8px', fontSize: 12, color: 'var(--color-text-primary)' }}
      />
      <button type="submit" className="ai-save-btn" disabled={isPending} style={{ padding: '5px 10px', fontSize: 12 }}>
        {isPending ? '…' : 'Spara'}
      </button>
      {msg && <span style={{ fontSize: 11, color: 'var(--color-success)', alignSelf: 'center' }}>{msg}</span>}
    </form>
  );
}
