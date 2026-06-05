'use client';

import { useEffect, useState } from 'react';
import { Radar, Loader2, Check, X, Play } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import * as UI from '../_components/ui';
import { graphFetch } from '../_lib/api';
import { useJobRuns } from '../_lib/jobRuns';
import {
  Client,
  Report,
  PollingWeek,
  SchedulesResp,
  Humanization,
  RecipesResp,
  RiskTimelineResp,
  RiskQuestionsResp,
  EngineHealthResp,
  PollingQuestionsResp,
  ViewMode,
  PERSONAS,
  PERSONA_SV,
  LS_CLIENT,
  LS_MODE,
  buildHero,
  harmLabel,
  cardStyle,
  errorStyle,
} from './_shared';
import { SectionHead, StageScale, EmptyState } from './_components/common';
import { StickyContextBar } from './_components/ContextBar';
import { SchedulesPanel, ActivityFeed, PollingQuestionsPanel, RiskTable, TrendView } from './_components/Panels';
import { RiskLoopStatus, ApprovedQuestionsPanel } from './_components/RiskLoop';
import { WeeklyVisibility } from './_components/WeeklyVisibility';
import { TrustGapCockpit } from './_components/TrustGapCockpit';
import { RiskLifecycleTimeline } from './_components/RiskTimeline';

export default function GraphRiskLoopPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [months, setMonths] = useState<string[] | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [polling, setPolling] = useState<PollingWeek[] | null>(null);
  const [schedules, setSchedules] = useState<SchedulesResp | null>(null);
  const [humanization, setHumanization] = useState<Humanization | null>(null);
  const [recipes, setRecipes] = useState<RecipesResp | null>(null);
  const [recipeBusyId, setRecipeBusyId] = useState<string | null>(null);
  const [generatingRecipes, setGeneratingRecipes] = useState(false);
  const [riskTimeline, setRiskTimeline] = useState<RiskTimelineResp | null>(null);
  const [riskQuestions, setRiskQuestions] = useState<RiskQuestionsResp | null>(null);
  const [engineHealth, setEngineHealth] = useState<EngineHealthResp | null>(null);
  const [pollingQuestions, setPollingQuestions] = useState<PollingQuestionsResp | null>(null);
  const [mode, setMode] = useState<ViewMode>('ops');
  const [error, setError] = useState<string | null>(null);
  const [softError, setSoftError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const { latest, runs: jobRuns, active: jobActive, trigger: runJob } = useJobRuns(selected);

  // Återställ sparat kund-val + läge innan första render (en gång).
  // ?client=<id>-deep-link har företräde över sparat val (enhetlig konvention
  // med /review?client=…), så att t.ex. risk-chippen på kundkortet landar rätt.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.localStorage.getItem(LS_MODE);
    if (m === 'ops' || m === 'customer') setMode(m);
    const qsClient = new URLSearchParams(window.location.search).get('client');
    const c = qsClient || window.localStorage.getItem(LS_CLIENT);
    if (c) setSelected(c);
  }, []);

  useEffect(() => {
    graphFetch<{ clients: Client[] }>('/api/clients')
      .then((d) => {
        setClients(d.clients);
        if (d.clients.length && !selected) {
          const saved = typeof window !== 'undefined' ? window.localStorage.getItem(LS_CLIENT) : null;
          const found = saved && d.clients.find((c) => c.client_id === saved) ? saved : d.clients[0].client_id;
          setSelected(found);
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  // Nollställ mjuk-fel-notisen vid varje ny laddningscykel; tysta delhämtnings-
  // fel nedan sätter den igen om något faktiskt misslyckas.
  useEffect(() => { setSoftError(null); }, [selected, refreshTick]);

  // Persist kund-val + läge.
  useEffect(() => {
    if (typeof window !== 'undefined' && selected) window.localStorage.setItem(LS_CLIENT, selected);
  }, [selected]);
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(LS_MODE, mode);
  }, [mode]);

  // Schemastatus (globalt, ej kundberoende) — verkligt Cloud Scheduler-läge + paus.
  useEffect(() => {
    let cancelled = false;
    graphFetch<SchedulesResp>('/api/schedules')
      .then((d) => !cancelled && setSchedules(d))
      .catch(() => !cancelled && setSchedules({ available: false, schedules: [] }));
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  async function toggleSchedule(name: string, paused: boolean) {
    try {
      await graphFetch(`/api/schedules/${name}/${paused ? 'resume' : 'pause'}`, { method: 'POST' });
      setRefreshTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Jobbknapp med progress (delas av polling/risk-detect/månadsrapport).
  function renderJobBtn(label: string, key: string, path: string, jobType: string, opts?: { needsClient?: boolean; onDone?: () => void }) {
    const st = jobActive[key] || 'idle';
    const Icon = st === 'running' ? Loader2 : st === 'success' ? Check : st === 'failed' ? X : Play;
    const color = st === 'failed' ? '#dc2626' : st === 'success' ? '#16a34a' : undefined;
    return (
      <button
        onClick={async () => {
          await runJob(key, path, jobType);
          opts?.onDone?.();
        }}
        disabled={(opts?.needsClient && !selected) || st === 'running'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
          background: st === 'success' ? 'rgba(159,81,182,0.18)' : 'transparent',
          color: st === 'success' ? C.accent : C.text,
          border: `1px solid ${st === 'success' ? 'rgba(159,81,182,0.3)' : C.border}`,
          borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: st === 'running' ? 'wait' : 'pointer',
        }}
      >
        <Icon size={12} color={color} style={st === 'running' ? { animation: 'spin 0.8s linear infinite' } : undefined} />
        {st === 'running' ? 'Kör…' : label}
      </button>
    );
  }

  // Lista tillgängliga månadsrapporter för vald kund, välj senaste.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    graphFetch<{ months: string[] }>(`/api/reports/${selected}`)
      .then((d) => {
        if (cancelled) return;
        setError(null);
        setMonths(d.months);
        setMonth(d.months[0] ?? null);
        if (d.months.length === 0) setReport(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setMonths([]);
        setReport(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, refreshTick]);

  // Veckovis pollingdata — oberoende av månadsrapporten (det löpande, automatiska måttet).
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    graphFetch<{ weeks: PollingWeek[] }>(`/api/polling/${selected}`)
      .then((d) => !cancelled && setPolling(d.weeks))
      .catch(() => { if (!cancelled) { setPolling([]); setSoftError('Vissa data kunde inte laddas — visar det som finns just nu.'); } });
    return () => {
      cancelled = true;
    };
  }, [selected, refreshTick]);

  // Humaniseringsbild — hur AI uppfattar kundens mänsklighet (trust_gap-perception).
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    graphFetch<Humanization>(`/api/reports/${selected}/humanization`)
      .then((d) => !cancelled && setHumanization(d))
      .catch(() => { if (!cancelled) { setHumanization(null); setSoftError('Vissa data kunde inte laddas — visar det som finns just nu.'); } });
    return () => {
      cancelled = true;
    };
  }, [selected, refreshTick]);

  // Recept-listan (Fas 1.5) — speglar /api/recipes med intervention attached.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    graphFetch<RecipesResp>(`/api/recipes/${selected}`)
      .then((d) => !cancelled && setRecipes(d))
      .catch(() => { if (!cancelled) { setRecipes(null); setSoftError('Vissa data kunde inte laddas — visar det som finns just nu.'); } });
    return () => {
      cancelled = true;
    };
  }, [selected, refreshTick]);

  async function transitionRecipe(recipeId: string, status: 'agreed' | 'acted' | 'dismissed', note?: string) {
    if (!selected) return;
    setRecipeBusyId(recipeId);
    try {
      await graphFetch(`/api/recipes/${selected}/${recipeId}/status`, {
        method: 'POST', body: JSON.stringify({ status, note: note || null }),
        headers: { 'Content-Type': 'application/json' },
      });
      setRefreshTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRecipeBusyId(null);
    }
  }

  async function regenerateRecipes() {
    if (!selected) return;
    setGeneratingRecipes(true);
    try {
      await graphFetch(`/api/recipes/${selected}/generate`, { method: 'POST' });
      setRefreshTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingRecipes(false);
    }
  }

  // Closed-loop tidslinje per risk — alla statusar, inte bara öppna.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    graphFetch<RiskTimelineResp>(`/api/review/${selected}/risks/timeline`)
      .then((d) => !cancelled && setRiskTimeline(d))
      .catch(() => { if (!cancelled) { setRiskTimeline(null); setSoftError('Vissa data kunde inte laddas — visar det som finns just nu.'); } });
    return () => {
      cancelled = true;
    };
  }, [selected, refreshTick]);

  // Riskloop-status — pending/approved questions, driver statuspanel + tomtillstånd.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    graphFetch<RiskQuestionsResp>(`/api/review/${selected}/risk-questions?status=all`)
      .then((d) => !cancelled && setRiskQuestions(d))
      .catch(() => { if (!cancelled) { setRiskQuestions(null); setSoftError('Vissa data kunde inte laddas — visar det som finns just nu.'); } });
    return () => {
      cancelled = true;
    };
  }, [selected, refreshTick]);

  // Polling-frågor (resolved per kund) — driver transparens-panelen i AI-synlighet.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    graphFetch<PollingQuestionsResp>(`/api/polling/${selected}/questions`)
      .then((d) => !cancelled && setPollingQuestions(d))
      .catch(() => { if (!cancelled) { setPollingQuestions(null); setSoftError('Vissa data kunde inte laddas — visar det som finns just nu.'); } });
    return () => {
      cancelled = true;
    };
  }, [selected, refreshTick]);

  // Probe-motorer-status — driver "Motor-status"-raden i sticky-baren. Auto-refresh
  // var 2:e min (backend cachar 60s, så detta ger maximalt 2 LLM-probar per minut).
  useEffect(() => {
    let cancelled = false;
    const fetchHealth = () => {
      graphFetch<EngineHealthResp>('/api/polling/engine-health')
        .then((d) => !cancelled && setEngineHealth(d))
        .catch(() => !cancelled && setEngineHealth(null));
    };
    fetchHealth();
    const id = setInterval(fetchHealth, 120000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshTick]);

  async function refreshEngineHealth() {
    try {
      const d = await graphFetch<EngineHealthResp>('/api/polling/engine-health?force=true');
      setEngineHealth(d);
    } catch {
      // tyst — UI:t visar gammal data
    }
  }

  // Hämta vald månads rapport.
  useEffect(() => {
    if (!selected || !month) return;
    let cancelled = false;
    graphFetch<Report>(`/api/reports/${selected}/${month}`)
      .then((r) => !cancelled && setReport(r))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [selected, month]);

  const conf = report?.decision_confidence ?? null;
  const exposure = report?.risk_exposure ?? null;

  // Första laddningen för vald kund: inget per-kund-data har kommit än → visa
  // skelett istället för att sektionerna poppar in en och en.
  const initialLoading = !!selected && polling === null && riskTimeline === null && humanization === null && riskQuestions === null;

  return (
    <GraphPageShell
      title="AI-synlighet"
      icon={<Radar size={22} />}
      subtitle="Riskloopen: hur säkert AI-motorerna svarar om kunden inför beslutskritiska frågor — beslutssäkerhet, kvarvarande risker och effekt över tid."
    >
      <StickyContextBar
        clients={clients}
        selected={selected}
        onSelectClient={setSelected}
        months={months}
        month={month}
        onSelectMonth={setMonth}
        onRefresh={() => setRefreshTick((t) => t + 1)}
        isDraft={!!report?.is_draft}
        mode={mode}
        onModeChange={setMode}
        hero={buildHero(report, riskQuestions, polling)}
        reportShareUrl={month && selected && report ? `/api/reports/${selected}/${month}/html` : null}
        engineHealth={engineHealth}
        onRefreshEngineHealth={refreshEngineHealth}
      />

      {/* Jobbkontroller + aktivitetsfeed (endast ops-läge) */}
      {mode === 'ops' && (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          {renderJobBtn('Kör polling', 'polling', '/api/jobs/polling', 'polling', { onDone: () => setRefreshTick((t) => t + 1) })}
          {renderJobBtn('Generera frågor', 'generate', `/api/jobs/risk-generate/${selected}`, 'risk_generate', { needsClient: true, onDone: () => setRefreshTick((t) => t + 1) })}
          {renderJobBtn('Kör risk-detect', 'risk', `/api/jobs/risk-detect/${selected}`, 'risk_detect', { needsClient: true, onDone: () => setRefreshTick((t) => t + 1) })}
          {renderJobBtn('Bygg månadsrapport', 'report', `/api/jobs/monthly-report/${selected}`, 'monthly_report', { needsClient: true, onDone: () => setRefreshTick((t) => t + 1) })}
        </div>
        <ActivityFeed runs={jobRuns} />
      </>
      )}

      {error && <div style={errorStyle}>{error}</div>}

      {/* Tysta delhämtnings-fel ytlggörs som icke-blockerande notis (ej hela sidan) */}
      {softError && !error && (
        <UI.StatusBanner tone="warn" style={{ marginBottom: 16 }}>{softError}</UI.StatusBanner>
      )}

      {/* Initial laddning — skelett istället för tom yta som poppar in sektionsvis */}
      {initialLoading && (
        <>
          <UI.SkeletonCard lines={3} />
          <UI.SkeletonCard lines={5} />
          <UI.SkeletonCard lines={3} />
        </>
      )}

      {/* Schemalagda körningar — endast ops-läge (admin-info) */}
      {mode === 'ops' && schedules?.available && schedules.schedules.length > 0 && (
        <SchedulesPanel rows={schedules.schedules} onToggle={toggleSchedule} />
      )}

      {/* Riskloop-status — endast ops-läge (intern admin-loop, ej kundens öga) */}
      {mode === 'ops' && (riskQuestions || riskTimeline) && (
        <RiskLoopStatus
          questions={riskQuestions}
          findings={riskTimeline}
          latestDetect={latest('risk_detect')}
          latestGenerate={latest('risk_generate')}
          clientId={selected}
          onChanged={() => setRefreshTick((t) => t + 1)}
        />
      )}

      {/* Risk-frågor (beslutssäkerhet) — transparens, placerad direkt efter riskloopen den hör till */}
      {riskQuestions && (riskQuestions.counts.approved > 0) && (
        <ApprovedQuestionsPanel
          questions={riskQuestions.questions.filter((q) => q.status === 'approved')}
          clientId={selected}
          mode={mode}
          onChanged={() => setRefreshTick((t) => t + 1)}
        />
      )}

      {/* Veckovis synlighet — det löpande, automatiska måttet (visas oavsett månadsrapport) */}
      {polling && polling.length > 0 && <WeeklyVisibility weeks={polling} />}

      {/* Synlighets-frågor (Share of Voice) — transparens, placerad direkt efter veckovis synlighet den driver */}
      {pollingQuestions && pollingQuestions.total > 0 && selected && (
        <PollingQuestionsPanel data={pollingQuestions} clientId={selected} mode={mode} />
      )}

      {/* Förtroendegap-cockpit — staplar i ops, bara plain-text i kund-läge */}
      {humanization?.available && (
        <TrustGapCockpit
          model={humanization}
          mode={mode}
          recipes={recipes}
          recipeBusyId={recipeBusyId}
          generatingRecipes={generatingRecipes}
          onTransition={transitionRecipe}
          onRegenerate={regenerateRecipes}
        />
      )}

      {/* Closed-loop tidslinje per risk — detektion → åtgärd → resolved, oberoende av månadsrapport */}
      {riskTimeline && <RiskLifecycleTimeline data={riskTimeline} approvedQuestions={riskQuestions?.counts.approved ?? null} />}

      {months?.length === 0 && (!polling || polling.length === 0) && <EmptyState />}

      {report && conf && (
        <>
          {/* 1. Beslutssäkerhet */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <SectionHead title="Beslutssäkerhet" hint="Hur stor andel av de beslutskritiska frågorna AI-motorerna svarar korrekt och rättvist på. En graderad resa — aldrig helt 'i mål', eftersom motorerna ständigt ändras." />
            {conf.score == null ? (
              <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>{conf.next_step}</p>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                  <span style={{ fontSize: 44, fontWeight: 600, color: C.text, letterSpacing: '-0.02em' }}>{conf.score}</span>
                  <span style={{ fontSize: 14, color: C.muted }}>/ 100</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>{conf.stage}</span>
                </div>
                <StageScale score={conf.score} ceiling={conf.ceiling} />
                <p style={{ fontSize: 13, color: C.text, margin: '14px 0 0', lineHeight: 1.6 }}>{report.verdict}</p>
                <p style={{ fontSize: 12, color: C.muted, margin: '10px 0 0' }}>
                  <strong style={{ color: C.text }}>Nästa steg:</strong> {conf.next_step}
                </p>
                <p style={{ fontSize: 11, color: C.dim, margin: '6px 0 0' }}>
                  {conf.safe}/{conf.answers} svar säkra · {conf.covered_personas}/3 personas mätta · tak {conf.ceiling}
                </p>
              </>
            )}
          </div>

          {/* 2. Risk Exposure per persona */}
          {exposure && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              {PERSONAS.map((p) => {
                const e = exposure.per_persona[p];
                return (
                  <div key={p} style={cardStyle}>
                    <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>
                      {PERSONA_SV[p]}
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 600, color: C.text, marginTop: 8, letterSpacing: '-0.02em' }}>
                      {e?.score != null ? `${Math.round(e.score * 100)}%` : '—'}
                    </div>
                    <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>
                      {e?.answers ? `Risk-exponering · ${e.answers} frågor` : 'Ej mätt än'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 3. Detekterade risker */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <SectionHead title="Detekterade risker" hint="De svar AI-motorerna ger som kan skada ett beslut — klassade mot skademodellen." />
            {report.detected.length === 0 ? (
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Inga öppna risker i den här rapporten.</p>
            ) : (
              <RiskTable findings={report.detected} />
            )}
          </div>

          {/* 4. Vad mjukvaran gjorde */}
          {report.actions.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: 16 }}>
              <SectionHead title="Vad vår mjukvara gjorde" hint="Källförsedda korrigeringar som mött detekterade risker — publicerade i JSON-LD, FAQ och profilsida." />
              {report.actions.map((a, i) => (
                <div key={i} style={{ padding: '10px 0', borderBottom: i < report.actions.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ fontSize: 13, color: C.text }}>{a.question || '—'}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                    {a.persona ? PERSONA_SV[a.persona] || a.persona : '—'} · {harmLabel(a.harm)} · {a.action_taken || 'åtgärdad'}
                    {a.action_at ? ` · ${a.action_at.slice(0, 10)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 5. Effekt över tid */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <SectionHead title="Effekt över tid" hint="Beslutssäkerhet månad för månad och antal lösta risker. Trenden — inte ett kausalitetspåstående — är beviset." />
            <TrendView trend={report.trend} currentScore={conf.score} />
          </div>

          {/* 6. Sekundärt: Parity Index */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>
                  Parity Index
                </div>
                <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>Könsbalans i porträtteringen — eget mått, ingår ej i beslutssäkerheten.</div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 600, color: C.text, letterSpacing: '-0.02em' }}>
                {report.parity_index != null ? `${Math.round(report.parity_index * 100)}%` : '—'}
              </div>
            </div>
          </div>
        </>
      )}
    </GraphPageShell>
  );
}
