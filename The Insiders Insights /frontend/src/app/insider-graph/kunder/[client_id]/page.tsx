'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users, Trash2, AlertCircle, ExternalLink, Check, Clock, ShieldCheck, Circle, ListChecks } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../../_components/GraphPageShell';
import AttestedUpload from '../../_components/AttestedUpload';
import JobFeedsEditor from '../../_components/JobFeedsEditor';
import LinkedInCapacityUpload from '../../_components/LinkedInCapacityUpload';
import VerificationCockpit from '../../_components/VerificationCockpit';
import ESGAddon from '../../_components/ESGAddon';
import PipelineStatus from '../../_components/PipelineStatus';
import ConnectorsEditor from '../../_components/ConnectorsEditor';
import MeasurementConfigEditor from '../../_components/MeasurementConfigEditor';
import IdentityMetadataEditor from '../../_components/IdentityMetadataEditor';
import AudiencePrioritiesEditor from '../../_components/AudiencePrioritiesEditor';
import PersonaPaletteEditor from '../../_components/PersonaPaletteEditor';
import OutputQualityPanel from '../../_components/OutputQualityPanel';
import * as UI from '../../_components/ui';
import { graphFetch } from '../../_lib/api';
import { useJobRuns, fmtRelative } from '../../_lib/jobRuns';

type Employee = {
  employee_id: string;
  name: string | null;
  title: string | null;
  linkedin_url: string | null;
  gender: string | null;
  opted_out: boolean;
};

type ClientDetail = {
  client_id: string;
  company_name: string | null;
  company_linkedin_url: string | null;
  active_connectors: string[];
  cdn_url: string | null;
  profile_url: string | null;
  tier: string;
  profile_base_url: string | null;
  last_compiled: string | null;
  // Konfig-fält som driver setup-checklistan (ON1/ON2). Alla redan med i
  // GET /api/clients/{id}-svaret — checklistan räknas klient-side ur dem.
  contact_email: string | null;
  industry: string | null;
  audience_priorities: unknown[] | null;
  employees: Employee[];
};

type DetailTab = 'oversikt' | 'datakallor' | 'konfiguration' | 'kvalitet' | 'esg' | 'fara';

export default function ClientDetailPage() {
  const params = useParams<{ client_id: string }>();
  const clientId = params.client_id;
  const router = useRouter();

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    | { kind: 'client'; name: string }
    | { kind: 'employee'; id: string; name: string }
    | null
  >(null);
  const [pipelineKey, setPipelineKey] = useState(0);
  const [tab, setTab] = useState<DetailTab>('oversikt');  // KU1: flikar i stället för 15 platta kort
  const { latest, active: jobActive, trigger: runJob } = useJobRuns(clientId);

  // Per-kund jobbknapp med progress; uppdaterar pipeline-stegen när jobbet är klart.
  // primary = fylld accent (full uppdatering), annars ghost (sekundär återpublicering).
  function renderJobBtn(
    label: string,
    key: string,
    path: string,
    jobType: string,
    opts: { primary?: boolean; title?: string; runningLabel?: string } = {},
  ) {
    return <UI.JobRunButton status={jobActive[key] || 'idle'} label={label} runningLabel={opts.runningLabel ?? 'Kör…'} primary={opts.primary} title={opts.title} onClick={async () => { await runJob(key, path, jobType); setPipelineKey((k) => k + 1); }} />;
  }

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await graphFetch<ClientDetail>(`/api/clients/${clientId}`);
      setClient(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleOptOut(emp: Employee) {
    setBusy(emp.employee_id);
    try {
      await graphFetch(`/api/clients/${clientId}/employees/${emp.employee_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opted_out: !emp.opted_out }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function deleteEmployee(id: string) {
    setBusy(id);
    try {
      await graphFetch(`/api/clients/${clientId}/employees/${id}`, { method: 'DELETE' });
      setConfirm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function deleteClient() {
    setBusy('client');
    try {
      await graphFetch(`/api/clients/${clientId}`, { method: 'DELETE' });
      router.push('/insider-graph/kunder');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <GraphPageShell
      title={client?.company_name || clientId}
      icon={<Users size={22} />}
      subtitle="Översikt, datakällor, konfiguration, kvalitet och medarbetare för kunden."
    >
      <UI.Breadcrumb
        items={[
          { label: 'Kunder', href: '/insider-graph/kunder' },
          { label: client?.company_name || clientId },
        ]}
      />

      {error && (
        <UI.StatusBanner tone="err" style={{ marginBottom: 16 }}>
          {error}
        </UI.StatusBanner>
      )}

      {client === null ? (
        <UI.Card padding="48px" style={{ textAlign: 'center', color: C.muted, fontSize: 13 }}>
          Laddar…
        </UI.Card>
      ) : (
        <>
          <UI.SegmentedToggle
            value={tab}
            onChange={(v) => setTab(v as DetailTab)}
            style={{ marginBottom: 16, flexWrap: 'wrap' }}
            options={[
              { value: 'oversikt', label: 'Översikt' },
              { value: 'datakallor', label: 'Datakällor' },
              { value: 'konfiguration', label: 'Konfiguration' },
              { value: 'kvalitet', label: 'Kvalitet & verifiering' },
              { value: 'esg', label: 'ESG' },
              { value: 'fara', label: 'Fara' },
            ]}
          />

          {tab === 'oversikt' && (<>
          {/* Pipeline-status — var står kunden, vad är nästa steg + per-kund-jobb */}
          <UI.Card padding="20px 24px" style={{ marginBottom: 16 }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Pipeline
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {renderJobBtn('Kör full uppdatering', 'extract', `/api/jobs/extract-claims/${clientId}`, 'extract_claims', {
                  primary: true,
                  runningLabel: 'Uppdaterar…',
                  title: 'Läser om allt material, extraherar verifierade claims och publicerar profilen (~1 min)',
                })}
                {renderJobBtn('Bygg om profilen', 'compile', `/api/jobs/compile/${clientId}`, 'compile_schema', {
                  title: 'Bygger om profilen från befintliga claims — snabbt, ingen ny analys',
                })}
              </div>
            </div>
            <PipelineStatus clientId={clientId} refreshKey={pipelineKey} />
            {/* Senast körd per jobb (för den här kunden) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 16, fontSize: 11, color: C.muted }}>
              {([['scrape_active', 'Scrape'], ['compile_schema', 'Kompilering'], ['extract_claims', 'Claims']] as [string, string][]).map(([type, label]) => {
                const run = latest(type);
                return (
                  <span key={type} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Clock size={11} color={C.dim} />
                    <strong style={{ color: C.text, fontWeight: 600 }}>{label}:</strong>
                    {run ? <><span>{fmtRelative(run.started_at)}</span>{run.status === 'success' && <Check size={11} color="#16a34a" />}</> : <span style={{ color: C.dim }}>aldrig körd</span>}
                  </span>
                );
              })}
            </div>
          </UI.Card>

          {/* Setup-checklista (ON1/ON2) — vad återstår att konfigurera. Döljs när allt är klart. */}
          <SetupChecklist client={client} />

          {/* Företagsöversikt */}
          <UI.Card padding="18px 20px" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: C.muted }}>
              <Row label="client_id" value={client.client_id} mono />
              <Row label="Tier" value={client.tier} />
              <Row label="Connectors" value={client.active_connectors.join(', ') || '—'} />
              {client.company_linkedin_url && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>LinkedIn</span>
                  <a href={client.company_linkedin_url} target="_blank" rel="noreferrer" style={{ color: C.accent, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Företagssida <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>
          </UI.Card>
          </>)}

          {tab === 'datakallor' && (<>
          {/* Connectors — vilka datakällor den här kunden hämtar från */}
          <ConnectorsEditor clientId={clientId} />
          </>)}

          {tab === 'konfiguration' && (<>
          {/* Mätkonfiguration — bransch-platshållare, personas, egna pollingfrågor (AI-synlighet) */}
          <MeasurementConfigEditor clientId={clientId} />

          {/* Identitetsmetadata — logotyp + svenskt org.nr (drivs in i schema.org-grafen) */}
          <IdentityMetadataEditor clientId={clientId} />

          {/* Audience-priorities — vem ska bli citerad av AI-motorer (driver output-kvalitet) */}
          <AudiencePrioritiesEditor clientId={clientId} />

          {/* Persona-palett — vilka målgrupper warmth-probarna mäter (Fas 2.1) */}
          <PersonaPaletteEditor clientId={clientId} />
          </>)}

          {tab === 'kvalitet' && (<>
          {/* Output-kvalitet — senaste rubric-scoring + länk till detaljvyn */}
          <OutputQualityPanel clientId={clientId} />
          </>)}

          {tab === 'esg' && (<>
          {/* AI-synlighet — ESG & CSRD Perception Audit (valbart tillägg, per kund) */}
          <ESGAddon clientId={clientId} />
          </>)}

          {tab === 'datakallor' && (<>
          {/* Officiell attesterad data (uppladdning) */}
          <AttestedUpload clientId={clientId} />
          </>)}

          {tab === 'kvalitet' && (<>
          {/* Verifierings-cockpit — manuell "Manually verified by Geogiraph" (ops, §7) */}
          <VerificationCockpit clientId={clientId} />

          {/* Bevisarkiv — granskningsbar provenans för denna kunds verifierade claims (D3) */}
          <UI.Card
            padding="18px 20px"
            style={{ marginBottom: 16 }}
            title="Bevisarkiv"
            hint="Tidsstämplad, granskningsbar provenans för varje verifierat påstående om kunden — med källcitat och de fyra kontrollerna. Revisor-/överlämningsbeviset."
            action={
              <a
                href={`/insider-graph/bevisarkiv?client=${clientId}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.accent, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
              >
                <ShieldCheck size={14} /> Öppna bevisarkiv
              </a>
            }
          />
          </>)}

          {tab === 'datakallor' && (<>
          {/* Platsannons-feeds (ATS-XML) — per kund */}
          <JobFeedsEditor clientId={clientId} />

          {/* LinkedIn-kapacitetsdata (kvartal) — dra in skärmklipp/export, per kund */}
          <LinkedInCapacityUpload clientId={clientId} />
          </>)}

          {tab === 'oversikt' && (<>
          {/* Medarbetare */}
          <UI.Card padding="18px 20px" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 14 }}>
              Medarbetare ({client.employees.length})
            </div>
            {client.employees.length === 0 ? (
              <UI.Empty>Inga medarbetare.</UI.Empty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {client.employees.map((emp) => (
                  <div
                    key={emp.employee_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '10px 12px',
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      opacity: emp.opted_out ? 0.6 : 1,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {emp.name || emp.employee_id}
                        {emp.opted_out && <UI.Badge tone="err">opt-out</UI.Badge>}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {emp.title || '—'}
                        {emp.linkedin_url && (
                          <>
                            {' · '}
                            <a href={emp.linkedin_url} target="_blank" rel="noreferrer" style={{ color: C.accent }}>LinkedIn</a>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <button
                        onClick={() => toggleOptOut(emp)}
                        disabled={busy === emp.employee_id}
                        style={{
                          padding: '5px 10px',
                          background: emp.opted_out ? 'rgba(34,197,94,0.12)' : 'transparent',
                          color: emp.opted_out ? '#16a34a' : C.muted,
                          border: `1px solid ${emp.opted_out ? 'rgba(34,197,94,0.3)' : C.border}`,
                          borderRadius: 7,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: busy === emp.employee_id ? 'wait' : 'pointer',
                        }}
                      >
                        {emp.opted_out ? 'Återuppta hämtning' : 'Opt out'}
                      </button>
                      <button
                        onClick={() => setConfirm({ kind: 'employee', id: emp.employee_id, name: emp.name || emp.employee_id })}
                        title="Radera all data om personen"
                        style={{ padding: '5px 8px', background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, cursor: 'pointer', display: 'flex' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </UI.Card>

          </>)}

          {tab === 'fara' && (<>
          {/* Farozon */}
          <UI.Card padding="18px 20px" style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.04)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', marginBottom: 6 }}>Radera kund</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
              Tar bort kunden med alla medarbetare, connectors, insamlad data och claims. Går inte att ångra.
            </div>
            <button
              onClick={() => setConfirm({ kind: 'client', name: client.company_name || client.client_id })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <Trash2 size={14} /> Radera kund
            </button>
          </UI.Card>
          </>)}
        </>
      )}

      {confirm && (
        <ConfirmDeleteModal
          title={confirm.kind === 'client' ? 'Radera kund' : 'Radera all data om personen'}
          description={
            confirm.kind === 'client'
              ? 'Detta raderar kunden och ALL kopplad data permanent. Skriv kundens namn för att bekräfta.'
              : 'Detta raderar medarbetaren, all insamlad data och claims som refererar personen. Skriv personens namn för att bekräfta.'
          }
          expected={confirm.name}
          busy={busy !== null}
          onCancel={() => setConfirm(null)}
          onConfirm={() => (confirm.kind === 'client' ? deleteClient() : deleteEmployee(confirm.id))}
        />
      )}
    </GraphPageShell>
  );
}

function ConfirmDeleteModal({
  title,
  description,
  expected,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  expected: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');
  const match = typed.trim() === expected.trim();
  return (
    <UI.Modal
      open
      onClose={onCancel}
      maxWidth={460}
      title={
        <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={18} /> {title}
        </span>
      }
    >
        <p style={{ fontSize: 12, color: C.text, lineHeight: 1.6, margin: '0 0 14px' }}>{description}</p>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
          Skriv <strong style={{ color: C.text }}>{expected}</strong> för att bekräfta:
        </div>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoFocus
          style={{ display: 'block', width: '100%', padding: '8px 12px', background: '#eef0f1', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: 'none', marginBottom: 16 }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{ padding: '8px 14px', background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Avbryt
          </button>
          <button
            onClick={onConfirm}
            disabled={!match || busy}
            style={{
              padding: '8px 14px',
              background: match ? 'rgba(239,68,68,0.85)' : 'rgba(239,68,68,0.2)',
              color: match ? '#fff' : '#fca5a5',
              border: '1px solid rgba(239,68,68,0.5)',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: match && !busy ? 'pointer' : 'not-allowed',
            }}
          >
            {busy ? 'Raderar…' : 'Radera permanent'}
          </button>
        </div>
    </UI.Modal>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      <span style={{ color: C.text, fontFamily: mono ? 'ui-monospace, monospace' : undefined }}>{value}</span>
    </div>
  );
}

// Setup-checklista (ON1/ON2): konfig-komplett för en nyss skapad kund. Skild från
// PipelineStatus (operativt körningstillstånd) — den här mäter att rätt SAKER är
// ifyllda. Kontakt-e-post markeras "krävs" eftersom leveransen tyst inte når någon
// utan den. Döljs helt när allt är klart, så den inte blir clutter på en mogen kund.
function SetupChecklist({ client }: { client: ClientDetail }) {
  const items = [
    {
      done: !!client.contact_email,
      label: 'Kontakt-e-post',
      hint: 'Krävs för leverans — installationskit och månadsmejl går hit. Sätts under Identitetsmetadata nedan.',
      critical: true,
    },
    {
      done: client.active_connectors.length > 0,
      label: 'Connectors valda',
      hint: 'Välj vilka källor kunden hämtar data från (Connectors nedan).',
    },
    {
      done: !!client.industry,
      label: 'Bransch ifylld',
      hint: 'Fyller platshållarna i mätfrågorna. Sätts under Mätkonfiguration nedan.',
    },
    {
      done: Array.isArray(client.audience_priorities) && client.audience_priorities.length > 0,
      label: 'Audience-targets satta',
      hint: 'Vilka målgrupper ni vill bli citerade av i AI-svar. Sätts under Persona-targets nedan.',
    },
    {
      done: !!client.last_compiled,
      label: 'Första profil körd',
      hint: 'Kör "Uppdatera profil" ovan för att hämta data och publicera profilen.',
    },
  ];
  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null; // allt klart → ingen clutter

  return (
    <UI.Card padding="18px 20px" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <ListChecks size={16} color={C.accent} />
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: C.text }}>Slutför setup</h2>
        <span style={{ fontSize: 12, color: C.muted, marginLeft: 'auto' }}>{doneCount}/{items.length} klart</span>
      </div>
      <p style={{ fontSize: 12, color: C.muted, margin: '0 0 12px' }}>
        Kunden är skapad. Det här återstår för en komplett konfiguration.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it) => (
          <div key={it.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            {it.done
              ? <Check size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: 1 }} />
              : <Circle size={16} color={it.critical ? '#d97706' : C.dim} style={{ flexShrink: 0, marginTop: 1 }} />}
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: it.done ? C.muted : C.text }}>
                {it.label}
                {it.critical && !it.done && (
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.06em' }}>krävs</span>
                )}
              </span>
              {!it.done && <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0' }}>{it.hint}</p>}
            </div>
          </div>
        ))}
      </div>
    </UI.Card>
  );
}
