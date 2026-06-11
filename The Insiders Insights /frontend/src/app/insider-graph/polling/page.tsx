'use client';

import { useEffect, useState } from 'react';
import { Radar, Loader2, Check, X, Play } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import * as UI from '../_components/ui';
import { graphFetch, proxyShareUrl } from '../_lib/api';
import { useJobRuns } from '../_lib/jobRuns';
import {
  Client,
  Report,
  PollingWeek,
  FramingInflationSummary,
  SchedulesResp,
  Humanization,
  RecipesResp,
  RiskTimelineResp,
  RiskQuestionsResp,
  EngineHealthResp,
  PollingQuestionsResp,
  PERSONAS,
  PERSONA_SV,
  LS_CLIENT,
  buildHero,
  cardStyle,
  errorStyle,
} from './_shared';
import { SectionHead, SectionDivider, StageScale, EmptyState } from './_components/common';
import { StickyContextBar } from './_components/ContextBar';
import { SchedulesPanel, ActivityFeed, PollingQuestionsPanel, TrendView } from './_components/Panels';
import { RiskLoopStatus, RiskQuestionsPanel } from './_components/RiskLoop';
import { WeeklyVisibility } from './_components/WeeklyVisibility';
import { CompetitorSurface } from './_components/CompetitorSurface';
import { TrustGapCockpit } from './_components/TrustGapCockpit';
import { RiskBoard } from './_components/RiskBoard';
import { AlignmentPanel, AlignmentAuditResp } from './_components/AlignmentPanel';
import { LangProbePanel, LangProbeResp } from './_components/LangProbePanel';
import { ExposureScale } from './_components/ExposureScale';
import { SettingsDrawer, SettingsTab } from './_components/SettingsDrawer';
import { Settings2 } from 'lucide-react';

export default function GraphRiskLoopPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [months, setMonths] = useState<string[] | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [polling, setPolling] = useState<PollingWeek[] | null>(null);
  const [inflation, setInflation] = useState<FramingInflationSummary | null>(null);
  const [schedules, setSchedules] = useState<SchedulesResp | null>(null);
  const [humanization, setHumanization] = useState<Humanization | null>(null);
  const [recipes, setRecipes] = useState<RecipesResp | null>(null);
  const [recipeBusyId, setRecipeBusyId] = useState<string | null>(null);
  const [generatingRecipes, setGeneratingRecipes] = useState(false);
  const [riskTimeline, setRiskTimeline] = useState<RiskTimelineResp | null>(null);
  const [riskQuestions, setRiskQuestions] = useState<RiskQuestionsResp | null>(null);
  const [engineHealth, setEngineHealth] = useState<EngineHealthResp | null>(null);
  const [alignment, setAlignment] = useState<AlignmentAuditResp | null>(null);
  const [langProbe, setLangProbe] = useState<LangProbeResp | null>(null);
  const [pollingQuestions, setPollingQuestions] = useState<PollingQuestionsResp | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [softError, setSoftError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const { latest, runs: jobRuns, active: jobActive, trigger: runJob } = useJobRuns(selected);

  // Återställ sparat kund-val innan första render (en gång).
  // ?client=<id>-deep-link har företräde över sparat val (enhetlig konvention
  // med /review?client=…), så att t.ex. risk-chippen på kundkortet landar rätt.
  useEffect(() => {
    if (typeof window === 'undefined') return;
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

  // Persist kund-val.
  useEffect(() => {
    if (typeof window !== 'undefined' && selected) window.localStorage.setItem(LS_CLIENT, selected);
  }, [selected]);

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
  // `title` förklarar vad jobbet faktiskt gör; `doneHint` länkar till ytan där
  // resultatet landar så att handling → effekt-loopen sluts (UX-audit p.3).
  function renderJobBtn(label: string, key: string, path: string, jobType: string, opts?: { needsClient?: boolean; onDone?: () => void; title?: string; doneHint?: { text: string; href: string } }) {
    const st = jobActive[key] || 'idle';
    const Icon = st === 'running' ? Loader2 : st === 'success' ? Check : st === 'failed' ? X : Play;
    const color = st === 'failed' ? '#dc2626' : st === 'success' ? '#16a34a' : undefined;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={async () => {
            await runJob(key, path, jobType);
            opts?.onDone?.();
          }}
          disabled={(opts?.needsClient && !selected) || st === 'running'}
          title={opts?.title}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
            background: st === 'success' ? 'rgba(224, 142, 121,0.18)' : 'transparent',
            color: st === 'success' ? C.accent : C.text,
            border: `1px solid ${st === 'success' ? 'rgba(224, 142, 121,0.3)' : C.border}`,
            borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: st === 'running' ? 'wait' : 'pointer',
          }}
        >
          <Icon size={12} color={color} style={st === 'running' ? { animation: 'spin 0.8s linear infinite' } : undefined} />
          {st === 'running' ? 'Kör…' : label}
        </button>
        {st === 'success' && opts?.doneHint && (
          <a href={opts.doneHint.href} style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {opts.doneHint.text}
          </a>
        )}
        {st === 'failed' && (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', whiteSpace: 'nowrap' }}>misslyckades — se Senaste händelser</span>
        )}
      </span>
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
    graphFetch<{ weeks: PollingWeek[]; framing_inflation_summary?: FramingInflationSummary | null }>(`/api/polling/${selected}`)
      .then((d) => { if (!cancelled) { setPolling(d.weeks); setInflation(d.framing_inflation_summary ?? null); } })
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

  // Alignment-audit — svarar profilsidan på det probe-frågorna faktiskt frågar?
  // (services/alignment_audit; persisterad i polling_results/alignment-latest).
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    graphFetch<AlignmentAuditResp>(`/api/review/${selected}/alignment`)
      .then((d) => !cancelled && setAlignment(d))
      .catch(() => { if (!cancelled) setAlignment(null); });
    return () => { cancelled = true; };
  }, [selected, refreshTick]);

  // C2 — sv-vs-en språkexperiment (polling_results/lang-probe-latest), matar C3.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    graphFetch<LangProbeResp>(`/api/polling/${selected}/lang-probe`)
      .then((d) => !cancelled && setLangProbe(d))
      .catch(() => { if (!cancelled) setLangProbe(null); });
    return () => { cancelled = true; };
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

  // R5: rapportens öppna risker visas som filter på RiskBoard istället för egen tabell.
  const reportFindingIds = report
    ? new Set(report.detected.map((f) => f.id).filter((id): id is string => !!id))
    : null;
  const reportOpenCount = report ? report.detected.filter((f) => (f.status || 'open') === 'open').length : 0;

  // Första laddningen för vald kund: inget per-kund-data har kommit än → visa
  // skelett istället för att sektionerna poppar in en och en.
  const initialLoading = !!selected && polling === null && riskTimeline === null && humanization === null && riskQuestions === null;

  // Zon-flaggor (F3-2): styr om respektive zonrubrik ska visas. En zon vars samtliga
  // kort är tomma får ingen rubrik (ingen tom etikett över ingenting).
  const hasVisibilitySection =
    (!!polling && polling.length > 0) || (!!pollingQuestions && pollingQuestions.total > 0);
  const hasRiskSection =
    !!riskTimeline ||
    !!humanization?.available ||
    !!riskQuestions;

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
        hero={buildHero(report, riskQuestions, polling)}
        reportShareUrl={month && selected && report ? `/api/reports/${selected}/${month}/html` : null}
        engineHealth={engineHealth}
        onRefreshEngineHealth={refreshEngineHealth}
      />

      {/* Jobbkontroller i pipeline-ordning: frågor → riskmätning → synlighet → rapport */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        {renderJobBtn('Generera risk-frågor', 'generate', `/api/jobs/risk-generate/${selected}`, 'risk_generate', {
          needsClient: true,
          onDone: () => setRefreshTick((t) => t + 1),
          title: 'Skapar nya beslutskritiska frågeförslag för vald kund (LLM). Förslagen hamnar under Risk-frågor → Väntar granskning och körs INTE förrän du godkänt dem.',
          doneHint: { text: 'klart — granska frågorna ↓', href: '#risk-fragor' },
        })}
        {renderJobBtn('Mät risker (detect)', 'risk', `/api/jobs/risk-detect/${selected}`, 'risk_detect', {
          needsClient: true,
          onDone: () => setRefreshTick((t) => t + 1),
          title: 'Ställer kundens godkända risk-frågor till AI-motorerna (flera körningar per fråga), klassar svaren mot skademodellen och uppdaterar öppna risker + beslutssäkerheten. Tar några minuter.',
          doneHint: { text: 'klart — se riskerna ↓', href: '#risk-board' },
        })}
        {renderJobBtn('Mät synlighet (polling)', 'polling', '/api/jobs/polling', 'polling', {
          onDone: () => setRefreshTick((t) => t + 1),
          title: 'Mäter Share of Voice: ställer synlighets-frågorna till AI-motorerna och räknar hur ofta kunden nämns. Körs för ALLA kunder, inte bara vald. Tar några minuter.',
          doneHint: { text: 'klart — se synligheten ↓', href: '#synlighet' },
        })}
        {renderJobBtn('Bygg månadsrapport', 'report', `/api/jobs/monthly-report/${selected}`, 'monthly_report', {
          needsClient: true,
          onDone: () => setRefreshTick((t) => t + 1),
          title: 'Sammanställer månadens rapport (internt utkast): beslutssäkerhet, risker, åtgärder, trend och narrativ. Ersätter tidigare utkast för samma månad.',
          doneHint: { text: 'klart — rapporten nedan ↓', href: '#manadsrapport' },
        })}
        <div style={{ flex: 1 }} />
        {/* L4: mätinställningarna nås där arbetet sker — drawer, inget sidbyte */}
        <button
          onClick={() => setSettingsTab('questions')}
          disabled={!selected}
          title="Frågesubstitutioner, egna synlighets-frågor och persona-palett för vald kund — samma inställningar som på kundkortet"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
            background: 'transparent', color: C.muted, border: `1px solid ${C.border}`,
            borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: selected ? 'pointer' : 'not-allowed',
          }}
        >
          <Settings2 size={12} />
          Mätinställningar
        </button>
      </div>
      <ActivityFeed runs={jobRuns} />

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

      {/* Schemalagda körningar (admin-info) */}
      {schedules?.available && schedules.schedules.length > 0 && (
        <SchedulesPanel rows={schedules.schedules} onToggle={toggleSchedule} />
      )}

      {/* ===== SYNLIGHET — det löpande, automatiska måttet (Share of Voice) ===== */}
      {hasVisibilitySection && (
        <SectionDivider
          label="Synlighet"
          hint="Hur ofta och hur AI-motorerna nämner kunden — det löpande, automatiska måttet."
        />
      )}

      {/* Veckovis synlighet */}
      {polling && polling.length > 0 && <div id="synlighet"><WeeklyVisibility weeks={polling} inflation={inflation} /></div>}

      {/* Konkurrent-analys per kategori (#2, väg A) — egen analytisk yta ur veckodatan */}
      {polling && polling.length > 0 && <CompetitorSurface weeks={polling} />}

      {/* Synlighets-frågor (Share of Voice) — transparens, direkt efter veckovis synlighet den driver */}
      {pollingQuestions && pollingQuestions.total > 0 && selected && (
        <PollingQuestionsPanel data={pollingQuestions} clientId={selected} mode="ops" onOpenSettings={() => setSettingsTab('questions')} />
      )}

      {/* ===== RISKER & ÅTGÄRDER — den slutna live-loopen samlad: upptäckt → åtgärd → löst (F3-2).
           Tidigare låg dessa paneler utspridda (riskloop-status överst, recept + livscykel långt
           ned, åtskilda av synlighetsytorna ovan). Nu kontiguösa så operatören håller EN vy av
           risk istället för fem. What-if hör till månadsrapportens beslutssäkerhet (projicerar
           just den poängen) och bor därför kvar i Månadsrapport-zonen nedan. ===== */}
      {hasRiskSection && (
        <SectionDivider
          label="Risker & åtgärder"
          hint="Den slutna loopen, löpande: upptäckt → åtgärd → löst."
        />
      )}

      {/* Riskloop-status — pipelinens lägesbild; godkännandet sker i Risk-frågor nedan */}
      {(riskQuestions || riskTimeline) && (
        <RiskLoopStatus
          questions={riskQuestions}
          findings={riskTimeline}
          latestDetect={latest('risk_detect')}
          latestGenerate={latest('risk_generate')}
          clientId={selected}
        />
      )}

      {/* Risk-frågor — hela frågelivscykeln (väntar/godkända/avvisade) i EN vy */}
      {riskQuestions && riskQuestions.questions.length > 0 && (
        <RiskQuestionsPanel
          questions={riskQuestions.questions}
          clientId={selected}
          onChanged={() => setRefreshTick((t) => t + 1)}
          onOpenPersonas={() => setSettingsTab('personas')}
        />
      )}

      {/* Förtroendegap-cockpit (recept/åtgärd) */}
      {humanization?.available && (
        <TrustGapCockpit
          model={humanization}
          mode="ops"
          recipes={recipes}
          recipeBusyId={recipeBusyId}
          generatingRecipes={generatingRecipes}
          onTransition={transitionRecipe}
          onRegenerate={regenerateRecipes}
        />
      )}

      {/* Frågejustering (alignment-audit): svarar sidan på probe-frågorna? Komplement
          till förtroendegapet — gap → källfört culture-claim som stänger det. */}
      {alignment && (
        <AlignmentPanel
          data={alignment}
          clientId={selected}
          onDone={() => setRefreshTick((t) => t + 1)}
        />
      )}

      {/* C2 — mätspråk sv/en (matar språkbeslutet C3) */}
      {langProbe && <LangProbePanel data={langProbe} clientId={selected} />}

      {/* Risk-centrerad yta (Etapp 1): kort per risk med livscykel, what-if-simulering
          och åtgärda/avfärda — ersätter Riskens livscykel + What-if + Detekterade risker */}
      {riskTimeline && (
        <RiskBoard
          data={riskTimeline}
          approvedQuestions={riskQuestions?.counts.approved ?? null}
          clientId={selected}
          conf={conf}
          reportFindingIds={reportFindingIds}
          onChanged={() => setRefreshTick((t) => t + 1)}
        />
      )}

      {months?.length === 0 && (!polling || polling.length === 0) && <EmptyState />}

      {report && conf && (
        // M3: hela rapportzonen inramad som ETT dokument — så blir placeringen sist
        // begriplig (pipelinens utdata, inte sju lösa boxar). Egen pergament-bakgrund så
        // de vita korten "ligger på" dokumentet; rubrik + utskriftslänk gör att operatören
        // ser exakt vad kunden får.
        <div
          id="manadsrapport"
          style={{ margin: '30px 0 16px', background: '#f8f6f0', border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px 22px' }}
        >
          {/* ===== MÅNADSRAPPORT — ögonblicksbild vid rapporttillfället, skild från den
               löpande loopen ovan. Beslutssäkerhet → exponering → risker & åtgärder →
               effekt över tid → paritet. ===== */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.accent, margin: 0 }}>
              Månadsrapport {month} — så ser kunden den
            </h3>
            {month && selected && (
              <a
                href={proxyShareUrl(`/api/reports/${selected}/${month}/html`)}
                target="_blank"
                rel="noopener noreferrer"
                title="Öppna utskriftsvyn — Skriv ut eller Spara som PDF där"
                style={{ fontSize: 11, fontWeight: 600, color: C.muted, textDecoration: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}
              >
                Utskriftsvy / PDF ↗
              </a>
            )}
          </div>
          <p style={{ fontSize: 12, color: C.muted, margin: '0 0 16px', lineHeight: 1.5 }}>
            Frusen ögonblicksbild vid rapporttillfället, skild från den löpande loopen ovan. Siffrorna här är rapportmånadens — toppbarens beslutssäkerhet är den live, löpande siffran.
          </p>
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

          {/* 2. Risk-exponering per persona — bandskala + insikt (E1, beslut B2).
              Rapporter byggda före E1 saknar band → fallback: riskpoäng + underlag.
              Den obegränsade kvoten visas aldrig. */}
          {exposure && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginBottom: 8 }}>
                Risk-exponering per persona
                <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>
                  — öppna riskers allvarlighet vägd mot mätunderlaget; klassas inte på tunt underlag
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {PERSONAS.map((p) => {
                  const e = exposure.per_persona[p];
                  return (
                    <div key={p} style={cardStyle}>
                      <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>
                        {PERSONA_SV[p]}
                      </div>
                      {e?.band ? (
                        <ExposureScale exposure={e} />
                      ) : (
                        // Äldre rapport utan band — interimsvisning (aldrig %)
                        <>
                          <div style={{ fontSize: 28, fontWeight: 600, color: C.text, marginTop: 8, letterSpacing: '-0.02em' }}>
                            {e && e.answers > 0 ? e.weighted : '—'}
                            {e && e.answers > 0 && <span style={{ fontSize: 13, fontWeight: 500, color: C.muted, marginLeft: 6 }}>riskpoäng</span>}
                          </div>
                          <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>
                            {e && e.answers > 0
                              ? `på ${e.answers} svar${e.answers < 5 ? ' · tunt underlag — tolka med försiktighet' : ''}`
                              : 'Ej mätt än'}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Risker & åtgärder i rapporten — ETT block (M1). HTML-rapporten har den
              fulla kanoniska tabellen; fliken visar summeringen och pekar till RiskBoard
              (R5) där samma kort hanteras. Ersätter "Detekterade risker" + "Vad mjukvaran
              gjorde" som separata boxar. */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <SectionHead title="Risker & åtgärder i rapporten" hint="Ögonblicksbilden vid rapporttillfället: öppna, åtgärdade och lösta i samma block. Den fulla tabellen finns i utskriftsvyn; korten hanteras i risköversikten ovan." />
            {report.detected.length === 0 && report.resolved.count === 0 ? (
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Inga risker i den här rapporten — motorerna svarade säkert på alla godkända frågor.</p>
            ) : (
              <p style={{ fontSize: 13, color: C.text, margin: 0, lineHeight: 1.6 }}>
                <strong>{reportOpenCount} öppn{reportOpenCount === 1 ? 'en' : 'a'}</strong>
                {' · '}{report.actions.length} åtgärdad{report.actions.length === 1 ? '' : 'e'}
                {' · '}{report.resolved.count} löst{report.resolved.count === 1 ? '' : 'a'}
                {'. '}
                <a href="#risk-board" style={{ color: C.accent, fontWeight: 600, textDecoration: 'none' }}>
                  Visa korten i risköversikten (filter "I månadsrapporten") ↑
                </a>
              </p>
            )}
          </div>

          {/* 5. Effekt över tid */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <SectionHead title="Effekt över tid" hint="Beslutssäkerhet månad för månad och antal lösta risker. Trenden — inte ett kausalitetspåstående — är beviset." />
            <TrendView trend={report.trend} currentScore={conf.score} />
          </div>

          {/* 6. Sekundärt: Parity Index v2 — gapet AI:s framlyfta personer vs formell ledning */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>
                  Parity Index
                </div>
                <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>
                  Könsbalans bland personer AI själv lyfter fram, mot er formella lednings sammansättning — eget mått, ingår ej i beslutssäkerheten.
                </div>
                {report.parity?.portrayed != null && (
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 6, lineHeight: 1.5 }}>
                    {report.parity.n} namngivna personer
                    {report.parity.baseline ? (
                      <> · ledningsbaseline {Math.round(report.parity.baseline.value * 100)} % ({report.parity.baseline.source})</>
                    ) : (
                      <> · baseline saknas — sätt ledningens kvinnoandel i kundkortet för gap-analys</>
                    )}
                    {!report.parity.reliable && (
                      <span style={{ fontWeight: 600, color: C.muted }}> · tunt underlag, ej trend</span>
                    )}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 28, fontWeight: 600, color: C.text, letterSpacing: '-0.02em' }}>
                  {report.parity?.portrayed != null
                    ? `${Math.round(report.parity.portrayed * 100)}%`
                    : report.parity_index != null ? `${Math.round(report.parity_index * 100)}%` : '—'}
                </div>
                {report.parity?.gap != null && (
                  <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: report.parity.reliable && Math.abs(report.parity.gap) > 0.1 ? C.accent : C.muted }}>
                    gap {report.parity.gap > 0 ? '+' : '−'}{Math.abs(Math.round(report.parity.gap * 100))} pe
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* L4: mätinställnings-drawer — stängning triggar full refresh så att
          ändrade frågor/personas speglas direkt i panelerna */}
      {settingsTab && selected && (
        <SettingsDrawer
          clientId={selected}
          initialTab={settingsTab}
          onClose={() => { setSettingsTab(null); setRefreshTick((t) => t + 1); }}
        />
      )}
    </GraphPageShell>
  );
}
