'use client';

import { useActionState, useState } from 'react';
import { updateAISetting } from '@/app/admin/ai/actions';

function providerLabel(p) {
  return p === 'GOOGLE' ? 'Google' : p === 'ANTHROPIC' ? 'Anthropic' : p;
}

export default function SettingForm({ pipelineStep, stepTitle, stepDesc, setting, models }) {
  const [state, action, pending] = useActionState(updateAISetting, undefined);
  const [challenger, setChallenger] = useState(setting?.challengerModelId || '');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const currentChampion = setting?.championModelId || models[0]?.modelId || '';

  return (
    <form action={action} className="ai-setting-card">
      <input type="hidden" name="pipelineStep" value={pipelineStep} />
      <div className="ai-setting-head">
        <div>
          <h3 className="ai-setting-title">{stepTitle}</h3>
          <p className="ai-setting-desc">{stepDesc}</p>
        </div>
        <div className="ai-setting-step-key">{pipelineStep}</div>
      </div>

      <div className="ai-setting-grid">
        <div className="ai-field">
          <label>Champion-modell</label>
          <select name="championModelId" defaultValue={currentChampion} disabled={pending}>
            {models.map((m) => (
              <option key={m.modelId} value={m.modelId}>
                {providerLabel(m.provider)} — {m.displayName}
              </option>
            ))}
          </select>
          <div className="ai-field-hint">Resultatet från denna modell visas för användaren.</div>
        </div>

        <div className="ai-field">
          <label>Challenger-modell (A/B, valfri)</label>
          <select
            name="challengerModelId"
            value={challenger}
            onChange={(e) => setChallenger(e.target.value)}
            disabled={pending}
          >
            <option value="">— Ingen —</option>
            {models
              .filter((m) => m.modelId !== currentChampion)
              .map((m) => (
                <option key={m.modelId} value={m.modelId}>
                  {providerLabel(m.provider)} — {m.displayName}
                </option>
              ))}
          </select>
          <div className="ai-field-hint">Körs parallellt i skuggläge, loggas för jämförelse.</div>
        </div>

        <div className="ai-field">
          <label>Shadow-andel (%)</label>
          <input
            type="number"
            name="shadowSampleRate"
            defaultValue={setting?.shadowSampleRate ?? 0}
            min={0}
            max={100}
            step={5}
            disabled={!challenger || pending}
          />
          <div className="ai-field-hint">
            {challenger
              ? 'Andel av körningar där challenger även körs. 100 = alltid.'
              : 'Välj challenger-modell först.'}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="ai-advanced-toggle"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? '−' : '+'} Avancerade inställningar
      </button>

      {showAdvanced && (
        <div className="ai-setting-grid">
          <div className="ai-field">
            <label>Temperature</label>
            <input
              type="number"
              name="temperature"
              defaultValue={setting?.temperature ?? ''}
              step={0.1}
              min={0}
              max={2}
              placeholder="0.2"
              disabled={pending}
            />
          </div>
          <div className="ai-field">
            <label>Max tokens</label>
            <input
              type="number"
              name="maxTokens"
              defaultValue={setting?.maxTokens ?? ''}
              min={1}
              placeholder="2048"
              disabled={pending}
            />
          </div>
          <div className="ai-field ai-field-wide">
            <label>System-prompt (valfri)</label>
            <textarea
              name="systemPrompt"
              defaultValue={setting?.systemPrompt ?? ''}
              rows={3}
              placeholder="Övergripande instruktion som skickas till modellen vid varje anrop i detta steg."
              disabled={pending}
            />
          </div>
        </div>
      )}

      <div className="ai-setting-footer">
        {state?.ok && <span className="ai-saved">✓ Sparat</span>}
        {state?.errors && (
          <span className="ai-field-error">Kontrollera inmatningen och försök igen.</span>
        )}
        <button type="submit" className="ai-save-btn" disabled={pending}>
          {pending ? 'Sparar…' : 'Spara'}
        </button>
      </div>
    </form>
  );
}
