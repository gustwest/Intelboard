'use client';

import { useActionState } from 'react';
import { intakeAssignmentAction } from '@/app/assignments/actions';

export default function IntakeForm() {
  const [state, action, pending] = useActionState(intakeAssignmentAction, undefined);

  return (
    <form action={action} className="ai-setting-card">
      <div className="ai-setting-grid">
        <div className="ai-field ai-field-wide">
          <label htmlFor="emailSubject">E-post-ämne (valfritt)</label>
          <input id="emailSubject" name="emailSubject" type="text" disabled={pending} placeholder="Ex: Senior Projektledare sökes till ICA – Stockholm" />
        </div>
        <div className="ai-field ai-field-wide">
          <label htmlFor="emailBody">Mailinnehåll</label>
          <textarea
            id="emailBody"
            name="emailBody"
            rows={18}
            required
            disabled={pending}
            placeholder="Klistra in hela mailet här – inklusive signatur. AI:n extraherar titel, kund, krav, datum, pris osv."
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 13 }}
          />
        </div>
      </div>

      {state?.message && (
        <p className="auth-error auth-error-banner" style={{ marginTop: 8 }}>{state.message}</p>
      )}

      <div className="ai-setting-footer">
        <button type="submit" className="ai-save-btn" disabled={pending}>
          {pending ? 'Analyserar mail…' : 'Extrahera uppdrag'}
        </button>
      </div>
    </form>
  );
}
