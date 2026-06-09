'use client';

/**
 * Verifierings-cockpit (spec §7.4–7.5) — ops-handling på kundkortet, ingen kundyta.
 *
 * Två grindar, precis som specen:
 *   1. ROLL-valet (källa / bevis / internt) — uppladdning ≠ verifiering.
 *        källa  → vanligt sourcat claim (bolagets ord), ingen stämpel.
 *        bevis  → körs genom verifieringsrutinen, kan bära en assurance-nivå.
 *        internt → lagras bara (bakgrund), blir inget claim, ingen stämpel.
 *   2. CHECKLISTAN (de fyra kontrollerna) — avgör OM och på VILKEN nivå stämpeln
 *      "Manually verified by Geogiraph" får sättas. Oberoende + spårbarhet bockas av
 *      ops; metodik + färskhet bedöms automatiskt av servern (ur metadata/datum).
 *
 * Talar med routers/verification.py: GET /evidence-types, GET /{cid}, POST /{cid} (multipart).
 * Servern är auktoritativ för grinden — vi speglar den bara för att vägleda valet.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck, UploadCloud, FileCheck2, CheckCircle2, XCircle, Stamp, ChevronDown,
} from 'lucide-react';
import { graphColors as C } from './GraphPageShell';
import * as UI from './ui';
import { graphFetch } from '../_lib/api';

type EvidenceType = {
  evidence_type: string;
  verification_mode: string;
  required_fields: string[];
  threshold: Record<string, number> | null;
  suggested_assurance_level: string | null;
};

type VerificationRow = {
  id: string;
  evidence_type?: string;
  verdict?: string;
  assurance_level?: string | null;
  verification_text?: string;
  verified_at?: string | null;
  expires_at?: string | null;
  subject?: { domain?: string; dimension?: string | null; metric?: string | null };
};

type SubmitResult = {
  status: string;
  role: string;
  verdict?: string;
  assurance_level?: string | null;
  verification_text?: string;
  expires_at?: string | null;
  claim_id?: string;
  verification_id?: string;
};

type Role = 'källa' | 'bevis' | 'internt';

// Värmedimensionerna (speglar schema_org/humanization_config.DIMENSIONS).
const DIMENSIONS: [string, string][] = [
  ['inclusion', 'Mångfald & inkludering'],
  ['wellbeing', 'Välmående & arbetsmiljö'],
  ['transparency', 'Transparens, kollektivavtal, likalön'],
  ['ethics', 'Etik, styrning, uppförande'],
  ['development', 'Lärande & utveckling'],
  ['community', 'Samhällsengagemang'],
];

const ASSURANCE: { key: string; label: string; help: string }[] = [
  { key: 'self_declared', label: 'Självdeklarerat', help: 'Bolagets eget ord, inget oberoende underlag.' },
  { key: 'third_party_reviewed', label: 'Tredjepartsgranskat', help: 'Vi har granskat tredjeparts-underlag mot profilen.' },
  { key: 'independently_assured', label: 'Oberoende bestyrkt', help: 'Reviderat/ackrediterat utfärdat underlag.' },
];

const ROLES: { key: Role; label: string; help: string }[] = [
  { key: 'källa', label: 'Källa', help: 'Blir ett vanligt sourcat claim — ingen stämpel.' },
  { key: 'bevis', label: 'Bevis att verifiera', help: 'Körs genom rutinen — kan bära en stämpel.' },
  { key: 'internt', label: 'Internt/kontext', help: 'Lagras bara. Publiceras ej, blir inget claim.' },
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

export default function VerificationCockpit({ clientId }: { clientId: string }) {
  const [types, setTypes] = useState<EvidenceType[] | null>(null);
  const [rows, setRows] = useState<VerificationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const loadRows = useCallback(async () => {
    try {
      const d = await graphFetch<{ verifications: VerificationRow[] }>(`/api/verification/${clientId}`);
      setRows(d.verifications);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;
    graphFetch<{ evidence_types: EvidenceType[] }>(`/api/verification/evidence-types`)
      .then((d) => { if (!cancelled) setTypes(d.evidence_types); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    loadRows();
    return () => { cancelled = true; };
  }, [clientId, loadRows]);

  return (
    <UI.Card padding="18px 20px" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <ShieldCheck size={15} color={C.accent} />
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Verifiering — &quot;Manually verified by Geogiraph&quot;</div>
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
        Ladda upp underlag (mejl/fil) och bestäm dess roll. Stämpeln är avsiktlig och knapp — bara &quot;bevis&quot; som
        klarar de fyra kontrollerna får den, på den nivå underlaget bär. Uppladdning är inte verifiering.
      </div>

      {error && (
        <UI.StatusBanner tone="err" style={{ marginBottom: 12 }}>
          {error}
        </UI.StatusBanner>
      )}

      {/* Befintliga verifieringar (revisionsspår) */}
      <VerificationList rows={rows} />

      {open ? (
        <UploadForm clientId={clientId} types={types || []} onDone={() => { loadRows(); }} onClose={() => setOpen(false)} />
      ) : (
        <button
          onClick={() => setOpen(true)}
          style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(224, 142, 121,0.15)', color: C.accent, border: '1px solid rgba(224, 142, 121,0.3)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <UploadCloud size={14} /> Ladda upp underlag
        </button>
      )}
    </UI.Card>
  );
}

function VerificationList({ rows }: { rows: VerificationRow[] | null }) {
  if (rows === null) return <div style={{ fontSize: 12, color: C.muted }}>Laddar…</div>;
  if (rows.length === 0) return <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>Inga verifieringar än.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r) => {
        const rejected = r.verdict === 'rejected';
        const Icon = rejected ? XCircle : CheckCircle2;
        const color = rejected ? '#b91c1c' : '#16a34a';
        return (
          <div key={r.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: C.text }}>
              <Icon size={14} color={color} />
              {r.evidence_type || 'bevis'}
              {r.assurance_level && (
                <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: 'rgba(224, 142, 121,0.12)', color: C.accent, fontWeight: 600 }}>
                  {ASSURANCE.find((a) => a.key === r.assurance_level)?.label || r.assurance_level}
                </span>
              )}
              {r.subject?.dimension && (
                <span style={{ fontSize: 10, color: C.muted }}>· {DIMENSIONS.find((d) => d[0] === r.subject?.dimension)?.[1] || r.subject.dimension}</span>
              )}
            </div>
            {r.verification_text && <div style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{r.verification_text}</div>}
            <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>
              {fmtDate(r.verified_at)}{r.expires_at ? ` · giltigt t.o.m. ${fmtDate(r.expires_at)}` : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UploadForm({
  clientId, types, onDone, onClose,
}: { clientId: string; types: EvidenceType[]; onDone: () => void; onClose: () => void }) {
  const [role, setRole] = useState<Role>('bevis');
  const [evidenceType, setEvidenceType] = useState<string>(types[0]?.evidence_type || '');
  const [domain, setDomain] = useState('culture');
  const [dimension, setDimension] = useState('wellbeing');
  const [metric, setMetric] = useState('');
  const [statement, setStatement] = useState('');
  const [predicate, setPredicate] = useState('');
  const [instrument, setInstrument] = useState('');
  const [docDate, setDocDate] = useState('');
  const [period, setPeriod] = useState('');
  const [sampleN, setSampleN] = useState('');
  const [responseRate, setResponseRate] = useState('');
  // De fyra kontrollerna: oberoende + spårbarhet bockas här; metodik + färskhet auto.
  const [independence, setIndependence] = useState(false);
  const [traceability, setTraceability] = useState(false);
  const [assurance, setAssurance] = useState('third_party_reviewed');
  const [rejecting, setRejecting] = useState(false);
  const [rejectedReason, setRejectedReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const profile = types.find((t) => t.evidence_type === evidenceType);
  // Klient-sidans spegling av grinden: utan oberoende+spårbarhet kan bara self_declared väljas.
  // (Metodik/färskhet bedöms av servern — den är auktoritativ och kan nedgradera nivån.)
  const opsGatePassed = independence && traceability;

  async function submit() {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('role', role);
      if (file) fd.append('file', file);
      if (role !== 'internt') {
        const payload: Record<string, unknown> = {
          evidence_type: evidenceType || 'policy_document',
          subject: {
            domain,
            dimension: domain === 'culture' ? dimension : null,
            metric: metric.trim() || null,
            predicate: predicate.trim() || null,
            statement: statement.trim() || null,
          },
          instrument_or_issuer: instrument.trim() || null,
          document_date: docDate || null,
        };
        if (role === 'bevis') {
          const methodology: Record<string, unknown> = {};
          if (period.trim()) methodology.period = period.trim();
          if (sampleN.trim()) methodology.sample_n = Number(sampleN);
          if (responseRate.trim()) methodology.response_rate = Number(responseRate);
          payload.methodology = methodology;
          payload.ops_checks = { independence, traceability };
          payload.chosen_assurance_level = assurance;
          if (rejecting) payload.rejected_reason = rejectedReason.trim() || 'avvisat vid granskning';
        }
        fd.append('payload', JSON.stringify(payload));
      }
      const data = await graphFetch<SubmitResult>(`/api/verification/${clientId}`, { method: 'POST', body: fd });
      setResult(data);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', background: '#eceae3',
    color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, outline: 'none',
  };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: C.muted, fontWeight: 600 };

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Nytt underlag</div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer' }}>Stäng</button>
      </div>

      {/* GRIND 1: roll-valet */}
      <div style={{ ...labelStyle, marginBottom: 6 }}>Roll (vad ska hända med filen?)</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        {ROLES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRole(r.key)}
            style={{
              flex: 1, minWidth: 120, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
              background: role === r.key ? 'rgba(224, 142, 121,0.12)' : 'transparent',
              border: `1px solid ${role === r.key ? C.accent : C.border}`,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: role === r.key ? C.accent : C.text }}>{r.label}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>{r.help}</div>
          </button>
        ))}
      </div>

      {/* Filuppladdning (revisionsspår — alltid sparad) */}
      <UI.DropZone
        onFile={setFile}
        padding="14px 16px"
        style={{ margin: '12px 0' }}
        ariaLabel="Ladda upp underlag — dra hit eller tryck för att välja (PDF, bild, kalkylblad)"
      >
        <UploadCloud size={20} color={C.muted} />
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginTop: 4 }}>
          {file ? <><FileCheck2 size={13} style={{ verticalAlign: 'middle' }} /> {file.name}</> : 'Dra underlaget hit eller klicka (PDF, bild, kalkylblad)'}
        </div>
      </UI.DropZone>

      {role !== 'internt' && (
        <>
          {/* Vad gäller det (subjekt) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <label style={labelStyle}>Område
              <select value={domain} onChange={(e) => setDomain(e.target.value)} style={inputStyle}>
                <option value="culture">Kultur/värme</option>
                <option value="esg">ESG</option>
              </select>
            </label>
            {domain === 'culture' && (
              <label style={labelStyle}>Dimension
                <select value={dimension} onChange={(e) => setDimension(e.target.value)} style={inputStyle}>
                  {DIMENSIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
            )}
          </div>
          <label style={{ ...labelStyle, display: 'block', marginBottom: 10 }}>Påstående (läsbar mening för profil/rapport)
            <UI.Input value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="t.ex. eNPS 8,5 i medarbetarenkät Q1 2026" style={{ padding: '6px 10px', width: '100%', display: 'block', marginTop: 4 }} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <label style={labelStyle}>Mätvärde/metric (valfritt)
              <UI.Input value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="eNPS" style={{ padding: '6px 10px', width: '100%', display: 'block', marginTop: 4 }} />
            </label>
            <label style={labelStyle}>schema.org-predikat (valfritt)
              <UI.Input value={predicate} onChange={(e) => setPredicate(e.target.value)} placeholder="aggregateRating" style={{ padding: '6px 10px', width: '100%', display: 'block', marginTop: 4 }} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <label style={labelStyle}>Instrument/utfärdare
              <UI.Input value={instrument} onChange={(e) => setInstrument(e.target.value)} placeholder="Winningtemp / GPTW / Bolagsverket" style={{ padding: '6px 10px', width: '100%', display: 'block', marginTop: 4 }} />
            </label>
            <label style={labelStyle}>Underlagets datum
              <UI.Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} style={{ padding: '6px 10px', width: '100%', display: 'block', marginTop: 4 }} />
            </label>
          </div>
        </>
      )}

      {/* GRIND 2: checklistan — bara för "bevis" */}
      {role === 'bevis' && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginTop: 4, background: '#fbfbfc' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 8 }}>De fyra kontrollerna</div>

          {/* Bevistyp + krävda metodik-fält */}
          <label style={{ ...labelStyle, display: 'block', marginBottom: 8 }}>Bevistyp
            <div style={{ position: 'relative' }}>
              <select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value)} style={inputStyle}>
                <option value="">— välj —</option>
                {types.map((t) => <option key={t.evidence_type} value={t.evidence_type}>{t.evidence_type}</option>)}
              </select>
              <ChevronDown size={13} color={C.muted} style={{ position: 'absolute', right: 8, top: 12, pointerEvents: 'none' }} />
            </div>
          </label>
          {profile && profile.required_fields.length > 0 && (
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 10 }}>
              Metodik kräver: {profile.required_fields.join(', ')}
              {profile.threshold && Object.keys(profile.threshold).length > 0 && ` · tröskel: ${Object.entries(profile.threshold).map(([k, v]) => `${k}=${v}`).join(', ')}`}
            </div>
          )}

          {/* Metodik-metadata (matar auto-kontrollen "metodik") */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            <label style={labelStyle}>Period<UI.Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-Q1" style={{ padding: '6px 10px', width: '100%', display: 'block', marginTop: 4 }} /></label>
            <label style={labelStyle}>Urval (N)<UI.Input value={sampleN} onChange={(e) => setSampleN(e.target.value)} inputMode="numeric" placeholder="420" style={{ padding: '6px 10px', width: '100%', display: 'block', marginTop: 4 }} /></label>
            <label style={labelStyle}>Svarsfrekvens<UI.Input value={responseRate} onChange={(e) => setResponseRate(e.target.value)} inputMode="decimal" placeholder="0.78" style={{ padding: '6px 10px', width: '100%', display: 'block', marginTop: 4 }} /></label>
          </div>

          {/* Ops bockar oberoende + spårbarhet; metodik + färskhet auto */}
          <CheckRow checked={independence} onChange={setIndependence} label="Oberoende" help="Underlaget kommer från någon annan än bolaget självt (eller är oberoende bestyrkt)." />
          <CheckRow checked={traceability} onChange={setTraceability} label="Spårbarhet" help="Den hävdade siffran/utsagan pekar på en specifik plats i underlaget." />
          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: C.muted, margin: '8px 0 4px' }}>
            <span>• Metodik: bedöms automatiskt ur metadata + tröskel</span>
            <span>• Färskhet: bedöms automatiskt ur datum</span>
          </div>

          {/* Assurance-nivå — begränsad av ops-grinden (servern är auktoritativ) */}
          <div style={{ ...labelStyle, margin: '12px 0 6px' }}>Assurance-nivå (begränsas av kontrollerna)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ASSURANCE.map((a) => {
              const locked = a.key !== 'self_declared' && !opsGatePassed;
              return (
                <label key={a.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, opacity: locked ? 0.45 : 1, cursor: locked ? 'not-allowed' : 'pointer' }}>
                  <input type="radio" name="assurance" disabled={locked} checked={assurance === a.key} onChange={() => setAssurance(a.key)} style={{ marginTop: 2 }} />
                  <span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{a.label}</span>
                    {a.key === profile?.suggested_assurance_level && <span style={{ fontSize: 9, marginLeft: 6, color: C.accent }}>(föreslagen)</span>}
                    <span style={{ fontSize: 10, color: C.muted, display: 'block', lineHeight: 1.4 }}>{a.help}{locked ? ' — kräver oberoende + spårbarhet.' : ''}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {/* Avvisa-väg */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted, marginTop: 10 }}>
            <input type="checkbox" checked={rejecting} onChange={(e) => setRejecting(e.target.checked)} /> Avvisa underlaget (ingen stämpel)
          </label>
          {rejecting && (
            <UI.Input value={rejectedReason} onChange={(e) => setRejectedReason(e.target.value)} placeholder="Skäl till avvisning" style={{ padding: '6px 10px', width: '100%', display: 'block', marginTop: 6 }} />
          )}
        </div>
      )}

      {err && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 10 }}>{err}</div>}
      {result && <ResultBanner result={result} />}

      <button
        onClick={submit}
        disabled={busy || (role !== 'internt' && !statement.trim() && !metric.trim())}
        style={{
          marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px',
          background: C.accent, color: '#fff', border: `1px solid ${C.accent}`, borderRadius: 8,
          fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
        }}
      >
        <Stamp size={14} /> {busy ? 'Sparar…' : role === 'bevis' ? (rejecting ? 'Spara avvisning' : 'Verifiera & stämpla') : role === 'källa' ? 'Spara som källa' : 'Spara internt'}
      </button>
    </div>
  );
}

function CheckRow({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label: string; help: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 2 }} />
      <span>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{label}</span>
        <span style={{ fontSize: 10, color: C.muted, display: 'block', lineHeight: 1.4 }}>{help}</span>
      </span>
    </label>
  );
}

function ResultBanner({ result }: { result: SubmitResult }) {
  const rejected = result.verdict === 'rejected';
  const isStamped = result.role === 'bevis' && !rejected && result.verdict !== undefined;
  const color = rejected ? '#b91c1c' : '#16a34a';
  const bg = rejected ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)';
  return (
    <div style={{ marginTop: 12, background: bg, border: `1px solid ${color}33`, borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color }}>
        {rejected ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
        {rejected ? 'Avvisat — ingen stämpel.'
          : isStamped ? `Stämplat: ${ASSURANCE.find((a) => a.key === result.assurance_level)?.label || result.assurance_level || 'verifierat'}`
            : result.role === 'källa' ? 'Sparat som källa (claim skapat).' : 'Sparat internt.'}
      </div>
      {result.verification_text && <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>{result.verification_text}</div>}
      {result.expires_at && <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>Giltigt t.o.m. {fmtDate(result.expires_at)}</div>}
    </div>
  );
}
