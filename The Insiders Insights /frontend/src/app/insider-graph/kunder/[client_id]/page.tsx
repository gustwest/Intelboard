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
import IdentityMetadataEditor from '../../_components/IdentityMetadataEditor';
import AudiencePrioritiesEditor from '../../_components/AudiencePrioritiesEditor';
import OutputQualityPanel from '../../_components/OutputQualityPanel';
import MejlutskickEditor from '../../_components/MejlutskickEditor';
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
  // R1: person-expertis — samtyckes-intyg + claims-status (driver raden i Medarbetare-boxen).
  consent_attested_at: string | null;
  expertise: { in_review: number; included: number; rejected: number };
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

type DetailTab = 'oversikt' | 'datakallor' | 'kvalitet' | 'mejlutskick' | 'esg' | 'fara';

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

  // R1: CV/bio-uppladdning per medarbetare. En aktiv uppladdning åt gången; samtyckes-
  // intyget (personens eget samtycke, dokumenterat hos kunden) är en hård grind före POST.
  const [expUpload, setExpUpload] = useState<{ empId: string; file: File | null; consent: boolean; busy: boolean } | null>(null);
  const [expMsg, setExpMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  async function submitExpertise() {
    if (!expUpload?.file || !expUpload.consent) return;
    setExpUpload((u) => (u ? { ...u, busy: true } : u));
    setExpMsg(null);
    try {
      const form = new FormData();
      form.append('file', expUpload.file);
      form.append('consent_attested', 'true');
      const res = await graphFetch<{ claims_created: number }>(
        `/api/clients/${clientId}/employees/${expUpload.empId}/expertise`,
        { method: 'POST', body: form },
      );
      setExpMsg({ tone: 'ok', text: `${res.claims_created} expertis-påståenden extraherade — granska och godkänn i Granska-fliken.` });
      setExpUpload(null);
      await load();
    } catch (e) {
      setExpMsg({ tone: 'err', text: e instanceof Error ? e.message : String(e) });
      setExpUpload((u) => (u ? { ...u, busy: false } : u));
    }
  }

  async function deleteExpertise(empId: string) {
    setBusy(empId);
    setExpMsg(null);
    try {
      await graphFetch(`/api/clients/${clientId}/employees/${empId}/expertise`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setExpMsg({ tone: 'err', text: e instanceof Error ? e.message : String(e) });
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
      title={client?.company_name ? `${client.company_name} (${client.client_id})` : clientId}
      icon={<Users size={22} />}
      subtitle="Översikt, datakällor, leverans & kvalitet, ESG och radering för kunden."
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
              { value: 'kvalitet', label: 'Leverans & kvalitet' },
              { value: 'mejlutskick', label: 'Mejlutskick' },
              { value: 'esg', label: 'ESG' },
              { value: 'fara', label: 'Radera kund' },
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
              {/* B1: client_id flyttat till sidrubriken (inom parentes) — bort härifrån för mindre dev-brus. */}
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
              {/* B2: direktlänk till den publika profilen + färskhet — ops kan hoppa dit och se senaste kompilering. */}
              {client.profile_url && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Profil{client.last_compiled ? ` · kompilerad ${fmtRelative(client.last_compiled)}` : ''}</span>
                  <a href={client.profile_url} target="_blank" rel="noreferrer" style={{ color: C.accent, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Visa publik profil <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>
          </UI.Card>

          {/* B6: AI-synlighetens mätkonfiguration + persona-palett flyttade till AI-synlighet-vyns
              ⚙-drawer (enda hemvist). Pekare så ops hittar dit. */}
          <UI.Card padding="14px 18px" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              Mätkonfiguration &amp; persona-palett (AI-synlighet) finns under{' '}
              <a href={`/insider-graph/polling?client=${clientId}`} style={{ color: C.accent, fontWeight: 600 }}>
                AI-synlighet → ⚙ Inställningar
              </a>.
            </div>
          </UI.Card>
          </>)}

          {tab === 'datakallor' && (<>
          {/* Connectors — vilka datakällor den här kunden hämtar från */}
          <ConnectorsEditor clientId={clientId} />
          </>)}

          {tab === 'kvalitet' && (<>
          {/* B6: Mätkonfiguration + Persona-palett (AI-synlighet) bor nu i AI-synlighet-vyns
              ⚙-drawer (enda hemvist) — inte här. Konfigurations-fliken upplöst. */}

          {/* Identitetsmetadata — logotyp + svenskt org.nr (drivs in i schema.org-grafen).
              B4 (Pass 2): kontakter/frekvens bryts ut härifrån till en Mejlutskick-flik. */}
          <IdentityMetadataEditor clientId={clientId} />

          {/* B5: Målgrupp-prioritet — vem ska bli citerad av AI-motorer (driver output-kvalitet) */}
          <AudiencePrioritiesEditor clientId={clientId} />

          {/* B7: Output-kvalitet — senaste rubric-scoring + länk till detaljvyn */}
          <OutputQualityPanel clientId={clientId} />
          </>)}

          {tab === 'mejlutskick' && (<>
          {/* B4: Mejlutskick — kundkontakter (mottagare av kit + månadsmejl). Utbrutet ur
              Identitetsmetadata; språk stannar i Leverans & kvalitet. */}
          <MejlutskickEditor clientId={clientId} />
          </>)}

          {tab === 'esg' && (<>
          {/* AI-synlighet — ESG & CSRD Perception Audit (valbart tillägg, per kund) */}
          <ESGAddon clientId={clientId} />
          </>)}

          {tab === 'datakallor' && (<>
          {/* Officiell attesterad data (uppladdning) */}
          <AttestedUpload clientId={clientId} />
          </>)}

          {tab === 'datakallor' && (<>
          {/* B8: Verifierings-cockpit — ett uppladdningsställe, hör hemma bland Datakällor.
              Manuell "Manually verified by Geogiraph" (ops, §7) */}
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

          {tab === 'datakallor' && (<>
          {/* B3: Medarbetare hör hemma bland Datakällor — det är en CV/bio-datakälla
              (genererar person-expertis-claims, nu synliga på profilsidan via A3). */}
          <UI.Card padding="18px 20px" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>
              Medarbetare ({client.employees.length})
            </div>
            <p style={{ fontSize: 11, color: C.dim, margin: '0 0 14px' }}>
              Navet för person-data: opt-out/radering, och expertis via CV/biografi — extraherad smalt
              (bara yrkesexpertis, aldrig persondata), granskas i Granska, publiceras på personens nod i AI-profilen.
            </p>
            {expMsg && (
              <UI.StatusBanner tone={expMsg.tone} style={{ marginBottom: 12 }}>{expMsg.text}</UI.StatusBanner>
            )}
            {client.employees.length === 0 ? (
              <UI.Empty>Inga medarbetare.</UI.Empty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {client.employees.map((emp) => (
                  <div
                    key={emp.employee_id}
                    style={{
                      padding: '10px 12px',
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      opacity: emp.opted_out ? 0.6 : 1,
                    }}
                  >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
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

                  {/* R1: person-expertis — uppladdning, samtyckes-intyg och claims-status per person */}
                  {!emp.opted_out && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}`, fontSize: 11 }}>
                      {expUpload?.empId === emp.employee_id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <input
                            type="file"
                            accept=".pdf,.txt,.md"
                            onChange={(e) => setExpUpload((u) => (u ? { ...u, file: e.target.files?.[0] || null } : u))}
                            style={{ fontSize: 11, color: C.text }}
                          />
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, color: C.text, cursor: 'pointer', lineHeight: 1.5 }}>
                            <input
                              type="checkbox"
                              checked={expUpload.consent}
                              onChange={(e) => setExpUpload((u) => (u ? { ...u, consent: e.target.checked } : u))}
                              style={{ marginTop: 2 }}
                            />
                            <span>
                              Kunden intygar att <strong>{emp.name || 'personen'}</strong> själv har lämnat samtycke till att
                              yrkesexpertis ur dokumentet publiceras på den publika AI-profilen. Endast yrkesrelaterad
                              expertis extraheras — persondata (adress, födelsedatum m.m.) slängs vid källan.
                            </span>
                          </label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={submitExpertise}
                              disabled={!expUpload.file || !expUpload.consent || expUpload.busy}
                              title={!expUpload.consent ? 'Samtyckes-intyget krävs innan uppladdning' : !expUpload.file ? 'Välj en fil (PDF/text)' : 'Extrahera expertis till granskningskön'}
                              style={{ padding: '5px 12px', background: expUpload.file && expUpload.consent ? 'rgba(224, 142, 121,0.16)' : 'transparent', color: expUpload.file && expUpload.consent ? C.accent : C.dim, border: `1px solid ${expUpload.file && expUpload.consent ? C.accent : C.border}`, borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: expUpload.busy ? 'wait' : 'pointer' }}
                            >
                              {expUpload.busy ? 'Extraherar…' : 'Extrahera expertis'}
                            </button>
                            <button onClick={() => setExpUpload(null)} disabled={expUpload.busy} style={{ padding: '5px 10px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 11, cursor: 'pointer' }}>
                              Avbryt
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', color: C.muted }}>
                          <span style={{ fontWeight: 600, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10 }}>Expertis</span>
                          {emp.expertise.in_review > 0 && (
                            <a href={`/insider-graph/review?client=${encodeURIComponent(clientId)}`} style={{ color: '#b45309', fontWeight: 600 }}>
                              {emp.expertise.in_review} i granskning →
                            </a>
                          )}
                          {emp.expertise.included > 0 && <span style={{ color: '#16a34a', fontWeight: 600 }}>{emp.expertise.included} publicerade</span>}
                          {emp.expertise.in_review === 0 && emp.expertise.included === 0 && <span style={{ fontStyle: 'italic' }}>ingen ännu</span>}
                          {emp.consent_attested_at && (
                            <span title="Samtyckes-intyg mottaget (personens eget samtycke, dokumenterat hos kunden)">samtycke intygat {emp.consent_attested_at.slice(0, 10)}</span>
                          )}
                          <button
                            onClick={() => { setExpUpload({ empId: emp.employee_id, file: null, consent: false, busy: false }); setExpMsg(null); }}
                            style={{ padding: '3px 10px', background: 'transparent', color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                          >
                            + Ladda upp CV/bio
                          </button>
                          {(emp.expertise.in_review > 0 || emp.expertise.included > 0) && (
                            <button
                              onClick={() => deleteExpertise(emp.employee_id)}
                              disabled={busy === emp.employee_id}
                              title="Ta bort personens expertis-claims (kö + leverans)"
                              style={{ padding: '3px 10px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 11, cursor: 'pointer' }}
                            >
                              Ta bort expertis
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
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
          style={{ display: 'block', width: '100%', padding: '8px 12px', background: '#eceae3', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: 'none', marginBottom: 16 }}
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
      hint: 'Krävs för leverans — installationskit och månadsmejl går hit. Sätts under Leverans & kvalitet → Identitetsmetadata.',
      critical: true,
    },
    {
      done: client.active_connectors.length > 0,
      label: 'Connectors valda',
      hint: 'Välj vilka källor kunden hämtar data från (Datakällor → Connectors).',
    },
    {
      done: !!client.industry,
      label: 'Bransch ifylld',
      hint: 'Fyller platshållarna i mätfrågorna. Sätts under AI-synlighet → ⚙ Inställningar.',
    },
    {
      done: Array.isArray(client.audience_priorities) && client.audience_priorities.length > 0,
      label: 'Audience-targets satta',
      hint: 'Vilka målgrupper ni vill bli citerade av i AI-svar. Sätts under Leverans & kvalitet → Målgrupp-prioritet.',
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
