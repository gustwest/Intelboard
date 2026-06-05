'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Leaf, ArrowLeft, Check, X } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../../_components/GraphPageShell';
import * as UI from '../../_components/ui';
import { graphFetch } from '../../_lib/api';

// --- Typer (speglar routers/esg.py) ------------------------------------------
type PillarScore = {
  score: number | null;
  answers: number;
  weighted: number;
  critical_omission: number;
  high_reputation: number;
};
type RiskScore = { per_pillar: Record<string, PillarScore>; overall: number | null };
type Status = {
  client_id: string;
  esg_audit_enabled: boolean;
  questions: { pending: number; approved: number; lint_flagged: number };
  last_scan: { ran_at: string | null; total_answers: number; findings_count: number };
  findings: { open: number; actioned: number };
  risk_score: RiskScore;
  report_months: string[];
};
type Question = {
  id: string;
  pillar: string;
  kind: string;
  text: string;
  language: string;
  lint_status: string | null;
  lint_issues: string[];
};
type Finding = {
  id: string;
  pillar: string;
  question: string;
  engine: string;
  status: string;
  severity: string;
  sentiment: string;
  engine_excerpt: string;
  answer_excerpt: string;
};

const PILLAR_LABEL: Record<string, string> = { E: 'Miljö (E)', S: 'Socialt (S)', G: 'Styrning (G)' };
const STATUS_LABEL: Record<string, string> = {
  CRITICAL_OMISSION_RISK: 'Informationsgap',
  HIGH_REPUTATION_RISK: 'Reputationsrisk',
};

export default function ESGWorkspacePage() {
  const { client_id: clientId } = useParams<{ client_id: string }>();
  const [status, setStatus] = useState<Status | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [formFor, setFormFor] = useState<Finding | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, q, f] = await Promise.all([
        graphFetch<Status>(`/api/esg/${clientId}/status`),
        graphFetch<{ questions: Question[] }>(`/api/esg/${clientId}/questions`),
        graphFetch<{ findings: Finding[] }>(`/api/esg/${clientId}/findings`),
      ]);
      setStatus(s);
      setQuestions(q.questions);
      setFindings(f.findings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(job: 'generate' | 'scan' | 'report', label: string) {
    setBusy(job);
    setBanner(null);
    try {
      await graphFetch(`/api/esg/${clientId}/${job}`, { method: 'POST' });
      setBanner({ tone: 'ok', text: `${label} köad — kör i bakgrunden, uppdatera om en stund.` });
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function decideQuestion(q: Question, decision: 'approve' | 'reject', text?: string) {
    setBusy(q.id);
    try {
      await graphFetch(`/api/esg/${clientId}/questions/${q.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, ...(text !== undefined ? { text } : {}) }),
      });
      await load();
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  const rs = status?.risk_score;

  return (
    <GraphPageShell
      title="ESG & CSRD Perception Audit"
      icon={<Leaf size={22} />}
      subtitle={`AI-synlighet — blind nollmätning av hållbarhetsryktet i AI-motorer. Kund: ${clientId}`}
      badge="AI-synlighet"
    >
      <Link
        href={`/insider-graph/kunder/${clientId}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.muted, fontSize: 12, fontWeight: 600, textDecoration: 'none', marginBottom: 16 }}
      >
        <ArrowLeft size={14} /> Tillbaka till kunden
      </Link>

      {error && <Box tone="error">{error}</Box>}
      {banner && <Box tone={banner.tone}>{banner.text}</Box>}

      {status && !status.esg_audit_enabled && (
        <Box tone="error">ESG-tillägget är inte påslaget för den här kunden. Slå på det på kundsidan.</Box>
      )}

      {/* Statusrad */}
      {status && (
        <Card>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            <Stat label="Frågor att granska" value={status.questions.pending} hint={status.questions.lint_flagged ? `${status.questions.lint_flagged} flaggade av lint` : undefined} />
            <Stat label="Godkända frågor" value={status.questions.approved} />
            <Stat label="Öppna findings" value={status.findings.open} hint={status.findings.actioned ? `${status.findings.actioned} åtgärdade` : undefined} />
            <Stat label="Senaste skanning" value={status.last_scan.ran_at ? new Date(status.last_scan.ran_at).toLocaleDateString('sv-SE') : '—'} />
            <Stat label="AI ESG Risk Score" value={rs?.overall != null ? `${rs.overall}%` : '—'} hint="högre = högre risk" />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            <Action label="Generera frågebatteri" loading={busy === 'generate'} onClick={() => runAction('generate', 'Frågegenerering')} />
            <Action label="Kör blind skanning" loading={busy === 'scan'} onClick={() => runAction('scan', 'Skanning')} />
            <Action label="Bygg rapport" loading={busy === 'report'} onClick={() => runAction('report', 'Rapport')} />
            <Action label="Uppdatera" subtle loading={false} onClick={load} />
          </div>
        </Card>
      )}

      {/* AI ESG Risk Score per pelare + ESRS-koppling */}
      {rs && (
        <Card title="AI ESG Risk Score (0–100 %, högre = högre risk)">
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ color: C.muted, textAlign: 'left', fontSize: 11 }}>
                <th style={{ padding: '4px 6px' }}>Pelare</th>
                <th style={{ padding: '4px 6px', textAlign: 'right' }}>Risk</th>
                <th style={{ padding: '4px 6px', textAlign: 'right' }}>Informationsgap</th>
                <th style={{ padding: '4px 6px', textAlign: 'right' }}>Reputationsrisk</th>
                <th style={{ padding: '4px 6px', textAlign: 'right' }}>Svar</th>
              </tr>
            </thead>
            <tbody>
              {(['E', 'S', 'G'] as const).map((p) => {
                const v = rs.per_pillar[p];
                return (
                  <tr key={p} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: '6px' }}>{PILLAR_LABEL[p]}</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: 600 }}>{v?.score != null ? `${v.score}%` : '—'}</td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>{v?.critical_omission ?? 0}</td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>{v?.high_reputation ?? 0}</td>
                    <td style={{ padding: '6px', textAlign: 'right', color: C.muted }}>{v?.answers ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
            Riktning, inte en CSRD-rapport eller dubbel väsentlighetsanalys. Mäter hur AI-motorerna
            porträtterar bolagets hållbarhet — inte bolagets faktiska ESG-prestanda.
          </p>
        </Card>
      )}

      {/* Frågor att granska (review-grind) */}
      <Card title={`Frågor att granska (${questions.length})`}>
        {questions.length === 0 ? (
          <Empty>Inga frågor väntar. Klicka «Generera frågebatteri» för att skapa nya.</Empty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {questions.map((q) => (
              <QuestionRow key={q.id} q={q} busy={busy === q.id} onDecide={decideQuestion} />
            ))}
          </div>
        )}
      </Card>

      {/* Findings + "Borde svaret varit annorlunda?" */}
      <Card title={`Detekterade risker (${findings.length})`}>
        {findings.length === 0 ? (
          <Empty>Inga öppna findings. Kör en skanning på godkända frågor.</Empty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {findings.map((f) => (
              <FindingRow key={f.id} f={f} onRespond={() => setFormFor(f)} />
            ))}
          </div>
        )}
      </Card>

      {formFor && (
        <MetricsFormModal
          clientId={clientId}
          finding={formFor}
          onClose={() => setFormFor(null)}
          onSubmitted={async () => {
            setFormFor(null);
            setBanner({ tone: 'ok', text: 'ESG-data inskickad — källförsedda korrigeringar skapade.' });
            await load();
          }}
        />
      )}
    </GraphPageShell>
  );
}

// --- Småkomponenter ----------------------------------------------------------
function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <UI.Card padding="18px 20px" style={{ marginBottom: 16 }}>
      {title && <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 14 }}>{title}</div>}
      {children}
    </UI.Card>
  );
}

function Box({ tone, children }: { tone: 'ok' | 'error'; children: React.ReactNode }) {
  return (
    <UI.StatusBanner tone={tone === 'ok' ? 'ok' : 'err'} style={{ marginBottom: 16 }}>
      {children}
    </UI.StatusBanner>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: C.dim }}>{hint}</div>}
    </div>
  );
}

function Action({ label, loading, onClick, subtle }: { label: string; loading: boolean; onClick: () => void; subtle?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        padding: '7px 12px',
        background: subtle ? 'transparent' : 'rgba(159,81,182,0.12)',
        color: subtle ? C.muted : C.accent,
        border: `1px solid ${subtle ? C.border : 'rgba(159,81,182,0.4)'}`,
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        cursor: loading ? 'wait' : 'pointer',
      }}
    >
      {loading ? 'Köar…' : label}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <UI.Empty style={{ padding: 0, textAlign: 'left' }}>{children}</UI.Empty>;
}

function Pill({ text, color }: { text: string; color: string }) {
  // Mappa de tidigare hårdkodade färgerna till UI.Badge-toner (status-normalisering).
  const tone =
    color === '#ef4444' ? 'err'
    : color === '#f59e0b' ? 'warn'
    : color === C.muted ? 'neutral'
    : 'accent';
  return <UI.Badge tone={tone}>{text}</UI.Badge>;
}

function QuestionRow({ q, busy, onDecide }: { q: Question; busy: boolean; onDecide: (q: Question, d: 'approve' | 'reject', text?: string) => void }) {
  const [text, setText] = useState(q.text);
  const flagged = q.lint_status === 'rewritten' || (q.lint_issues && q.lint_issues.length > 0);
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <Pill text={PILLAR_LABEL[q.pillar] || q.pillar} color={C.accent} />
        <Pill text={q.kind === 'example' ? 'exempel' : 'expansion'} color={C.muted} />
        {flagged && <Pill text={q.lint_status === 'rewritten' ? 'lint: omformulerad' : 'lint: flaggad'} color="#f59e0b" />}
        {q.lint_issues?.length > 0 && <span style={{ fontSize: 10, color: C.dim }}>{q.lint_issues.join(', ')}</span>}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        style={{ width: '100%', resize: 'vertical', padding: '6px 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.text, fontFamily: 'inherit' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          onClick={() => onDecide(q, 'approve', text !== q.text ? text : undefined)}
          disabled={busy}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'rgba(34,197,94,0.12)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}
        >
          <Check size={13} /> Godkänn
        </button>
        <button
          onClick={() => onDecide(q, 'reject')}
          disabled={busy}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}
        >
          <X size={13} /> Avvisa
        </button>
      </div>
    </div>
  );
}

function FindingRow({ f, onRespond }: { f: Finding; onRespond: () => void }) {
  const sevColor = f.severity === 'high' ? '#ef4444' : f.severity === 'medium' ? '#f59e0b' : C.muted;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <Pill text={PILLAR_LABEL[f.pillar] || f.pillar} color={C.accent} />
        <Pill text={STATUS_LABEL[f.status] || f.status} color={f.status === 'CRITICAL_OMISSION_RISK' ? '#ef4444' : '#f59e0b'} />
        {f.severity && <Pill text={f.severity} color={sevColor} />}
        {f.engine && <span style={{ fontSize: 10, color: C.dim }}>{f.engine}</span>}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 4 }}>{f.question}</div>
      {f.answer_excerpt && (
        <div style={{ fontSize: 11, color: C.muted, background: '#f7f7f8', border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', marginBottom: 8, lineHeight: 1.5 }}>
          {f.answer_excerpt}
        </div>
      )}
      <button
        onClick={onRespond}
        style={{ padding: '6px 12px', background: 'rgba(159,81,182,0.12)', color: C.accent, border: '1px solid rgba(159,81,182,0.4)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
      >
        Borde svaret varit annorlunda? [Ja, vi har/gör detta]
      </button>
    </div>
  );
}

// --- 3-fas-formuläret --------------------------------------------------------
type NumField = { k: string; label: string; int?: boolean };
const PHASE1_NUM: NumField[] = [
  { k: 'scope_1_co2e', label: 'Scope 1 (ton CO2e)' },
  { k: 'scope_2_co2e', label: 'Scope 2 (ton CO2e)' },
  { k: 'scope_3_co2e', label: 'Scope 3 (ton CO2e)' },
  { k: 'net_zero_target_year', label: 'Netto-noll-mål (år)', int: true },
  { k: 'management_female_pct', label: 'Kvinnor i ledning (%)', int: true },
  { k: 'board_female_pct', label: 'Kvinnor i styrelse (%)', int: true },
];
const PHASE1_BOOL = [
  { k: 'iso_27001_certified', label: 'ISO 27001-certifierad' },
  { k: 'iso_14001_certified', label: 'ISO 14001-certifierad' },
];
const PHASE2_NUM: NumField[] = [
  { k: 'unadjusted_gender_pay_gap_pct', label: 'Ojusterat lönegap (%)' },
  { k: 'employee_turnover_rate', label: 'Personalomsättning (%)' },
];
const PHASE3_NUM: NumField[] = [
  { k: 'renewable_energy_share_pct', label: 'Förnybar energi (%)' },
  { k: 'waste_recycling_rate_pct', label: 'Återvinningsgrad (%)' },
  { k: 'supplier_code_of_conduct_signed_pct', label: 'Leverantörer m. CoC (%)' },
  { k: 'eu_taxonomy_alignment_turnover_pct', label: 'EU-taxonomi-anpassad oms. (%)' },
];
const MEDALS = ['None', 'Bronze', 'Silver', 'Gold', 'Platinum'];

function MetricsFormModal({ clientId, finding, onClose, onSubmitted }: { clientId: string; finding: Finding; onClose: () => void; onSubmitted: () => void }) {
  const [nums, setNums] = useState<Record<string, string>>({});
  const [bools, setBools] = useState<Record<string, boolean>>({ anti_corruption_policy_active: false });
  const [medal, setMedal] = useState('None');
  const [phase2, setPhase2] = useState(false);
  const [phase3, setPhase3] = useState(false);
  const [sourceLabel, setSourceLabel] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setNum(k: string, v: string) {
    setNums((p) => ({ ...p, [k]: v }));
  }
  const num = (f: NumField) => (f.int ? Math.round(Number(nums[f.k])) : Number(nums[f.k]));

  async function submit() {
    // Fas 1 obligatorisk: alla numeriska fält måste vara ifyllda.
    const missing = PHASE1_NUM.filter((f) => nums[f.k] === undefined || nums[f.k] === '');
    if (missing.length) {
      setErr(`Fyll i alla Fas 1-fält: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
    const body: Record<string, unknown> = {
      finding_id: finding.id,
      triggered_by_question: finding.question,
      ...(sourceLabel ? { source_label: sourceLabel } : {}),
      ...(sourceUrl ? { source_url: sourceUrl } : {}),
      core: {
        ...Object.fromEntries(PHASE1_NUM.map((f) => [f.k, num(f)])),
        iso_27001_certified: !!bools.iso_27001_certified,
        iso_14001_certified: !!bools.iso_14001_certified,
      },
    };
    if (phase2) {
      body.csrd_basic = {
        ...Object.fromEntries(PHASE2_NUM.map((f) => [f.k, num(f)])),
        anti_corruption_policy_active: !!bools.anti_corruption_policy_active,
        ecovadis_medal: medal,
      };
    }
    if (phase3) {
      body.enterprise_advanced = Object.fromEntries(PHASE3_NUM.map((f) => [f.k, num(f)]));
    }
    setSubmitting(true);
    setErr(null);
    try {
      await graphFetch(`/api/esg/${clientId}/submit-metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      onSubmitted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <UI.Modal open onClose={onClose} title="Borde svaret varit annorlunda?" maxWidth={560}>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 16px', lineHeight: 1.5 }}>
          Fyll i verifierade ESG-data. Det blir källförsedda korrigeringar som AI-motorerna kan ta in.
          Fas 1 är obligatorisk; Fas 2 och 3 är frivilliga.
        </p>

        {err && <Box tone="error">{err}</Box>}

        <Section title="Fas 1 — Core ESG (obligatorisk)">
          <Grid>
            {PHASE1_NUM.map((f) => (
              <Field key={f.k} label={f.label}>
                <input type="number" value={nums[f.k] ?? ''} onChange={(e) => setNum(f.k, e.target.value)} style={inputStyle} />
              </Field>
            ))}
          </Grid>
          <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
            {PHASE1_BOOL.map((b) => (
              <Checkbox key={b.k} label={b.label} checked={!!bools[b.k]} onChange={(v) => setBools((p) => ({ ...p, [b.k]: v }))} />
            ))}
          </div>
        </Section>

        <Toggle label="Lägg till Fas 2 — CSRD Basic" on={phase2} onClick={() => setPhase2((v) => !v)} />
        {phase2 && (
          <Section title="Fas 2 — CSRD Basic">
            <Grid>
              {PHASE2_NUM.map((f) => (
                <Field key={f.k} label={f.label}>
                  <input type="number" value={nums[f.k] ?? ''} onChange={(e) => setNum(f.k, e.target.value)} style={inputStyle} />
                </Field>
              ))}
              <Field label="EcoVadis-medalj">
                <select value={medal} onChange={(e) => setMedal(e.target.value)} style={inputStyle}>
                  {MEDALS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </Grid>
            <div style={{ marginTop: 10 }}>
              <Checkbox label="Aktiv antikorruptionspolicy" checked={!!bools.anti_corruption_policy_active} onChange={(v) => setBools((p) => ({ ...p, anti_corruption_policy_active: v }))} />
            </div>
          </Section>
        )}

        <Toggle label="Lägg till Fas 3 — Enterprise Advanced" on={phase3} onClick={() => setPhase3((v) => !v)} />
        {phase3 && (
          <Section title="Fas 3 — Enterprise Advanced">
            <Grid>
              {PHASE3_NUM.map((f) => (
                <Field key={f.k} label={f.label}>
                  <input type="number" value={nums[f.k] ?? ''} onChange={(e) => setNum(f.k, e.target.value)} style={inputStyle} />
                </Field>
              ))}
            </Grid>
          </Section>
        )}

        <Section title="Källa (proveniens)">
          <Grid>
            <Field label="Etikett (t.ex. Hållbarhetsrapport 2025)">
              <input value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} placeholder="uppgift från bolaget" style={inputStyle} />
            </Field>
            <Field label="URL (valfri)">
              <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} style={inputStyle} />
            </Field>
          </Grid>
        </Section>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: '8px 14px', background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Avbryt</button>
          <button onClick={submit} disabled={submitting} style={{ padding: '8px 14px', background: 'rgba(159,81,182,0.85)', color: '#fff', border: '1px solid rgba(159,81,182,0.6)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: submitting ? 'wait' : 'pointer' }}>
            {submitting ? 'Skickar…' : 'Skicka in'}
          </button>
        </div>
    </UI.Modal>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', background: '#fff', color: C.text,
  border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: 'none',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>{label}</div>
      {children}
    </label>
  );
}
function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.text, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', marginBottom: 12, background: on ? 'rgba(159,81,182,0.08)' : 'transparent', color: on ? C.accent : C.muted, border: `1px dashed ${on ? 'rgba(159,81,182,0.4)' : C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
      {on ? '− ' : '+ '}{label}
    </button>
  );
}
