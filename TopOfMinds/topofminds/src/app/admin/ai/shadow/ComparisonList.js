'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recordComparisonAction } from './actions';

export default function ComparisonList({ pairs }) {
  const [blind, setBlind] = useState(true);
  return (
    <>
      <div className="shadow-toolbar">
        <label className="profile-checkbox">
          <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} />
          <span>Blind (dölj modellnamn)</span>
        </label>
        <span className="ai-field-hint">Visar {pairs.length} par.</span>
      </div>
      <div className="shadow-list">
        {pairs.map((pair) => (
          <PairRow key={pair.jobId} pair={pair} blind={blind} />
        ))}
      </div>
    </>
  );
}

function PairRow({ pair, blind }) {
  const [isPending, startTransition] = useTransition();
  const [savedPref, setSavedPref] = useState(pair.champion.comparisons[0]?.preference || null);
  const [notes, setNotes] = useState(pair.champion.comparisons[0]?.notes || '');
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  const a = pair.champion;
  const b = pair.challenger;

  const pick = (preference) => {
    startTransition(async () => {
      const res = await recordComparisonAction({
        shadowResultId: a.id,
        preference,
        notes,
      });
      if (res?.ok) {
        setSavedPref(preference);
        router.refresh();
      }
    });
  };

  const costA = formatDurationAndCost(a);
  const costB = formatDurationAndCost(b);

  return (
    <div className="shadow-pair">
      <div className="shadow-pair-head" onClick={() => setExpanded(!expanded)}>
        <div className="shadow-pair-step">{a.pipelineStep}</div>
        <div className="shadow-pair-time">{new Date(a.createdAt).toLocaleString('sv-SE')}</div>
        {savedPref && (
          <div className={`shadow-pref-badge pref-${savedPref.toLowerCase()}`}>
            {savedPref === 'A_BETTER' ? 'A vald' : savedPref === 'B_BETTER' ? 'B vald' : 'Lika'}
          </div>
        )}
        <div className="shadow-pair-expand">{expanded ? '▾' : '▸'}</div>
      </div>

      {expanded && (
        <div className="shadow-pair-body">
          <div className="shadow-cols">
            <div className="shadow-col">
              <div className="shadow-col-head">
                <span className="shadow-col-label shadow-a">A</span>
                {!blind && <span className="shadow-model-id">{a.modelId}</span>}
                <span className="shadow-meta">{costA}</span>
              </div>
              <pre className="shadow-output">{a.output}</pre>
            </div>
            <div className="shadow-col">
              <div className="shadow-col-head">
                <span className="shadow-col-label shadow-b">B</span>
                {!blind && <span className="shadow-model-id">{b.modelId}</span>}
                <span className="shadow-meta">{costB}</span>
              </div>
              <pre className="shadow-output">{b.output}</pre>
            </div>
          </div>

          <div className="shadow-vote-row">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Valfri kommentar (bra/dåliga exempel, mönster du sett...)"
              rows={2}
            />
            <div className="shadow-vote-buttons">
              <button
                type="button"
                disabled={isPending}
                className={`ai-toggle-btn ${savedPref === 'A_BETTER' ? 'vote-picked' : ''}`}
                onClick={() => pick('A_BETTER')}
              >
                A bättre
              </button>
              <button
                type="button"
                disabled={isPending}
                className={`ai-toggle-btn ${savedPref === 'TIE' ? 'vote-picked' : ''}`}
                onClick={() => pick('TIE')}
              >
                Lika
              </button>
              <button
                type="button"
                disabled={isPending}
                className={`ai-toggle-btn ${savedPref === 'B_BETTER' ? 'vote-picked' : ''}`}
                onClick={() => pick('B_BETTER')}
              >
                B bättre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDurationAndCost(r) {
  return `${r.inputTokens + r.outputTokens} tokens · ${r.latencyMs}ms`;
}
