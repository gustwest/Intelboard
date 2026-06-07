'use client';

import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Check, X, Download, ExternalLink, Quote } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import * as UI from '../_components/ui';
import { graphFetch } from '../_lib/api';
import { Client, LS_CLIENT, cardStyle, errorStyle, selectStyle } from '../polling/_shared';

// --- Typer som speglar /api/proof-archive (services/proof_archive.py) ---------

type Checks = Partial<Record<'independence' | 'methodology' | 'freshness' | 'traceability', boolean>>;

type Verification = {
  checks: Checks;
  verdict: string | null;
  verification_text: string | null;
  evidence_type: string | null;
  instrument_or_issuer: string | null;
  document_date: string | null;
  verified_at: string | null;
  verified_by: string | null;
  expires_at: string | null;
};

type ProofSource = {
  kind: string | null;
  label: string | null;
  url: string | null;
  attested_at: string | null;
  quote: string | null;
  verification_id: string | null;
};

type Entry = {
  claim_id: string;
  statement: string;
  claim_kind: string | null;
  facet: string;
  dimension: string | null;
  audience: string[];
  proof_tier: 'assured' | 'grounded';
  assurance_level: string | null;
  source: ProofSource;
  verification: Verification | null;
  as_of: string;
  validated_by: string | null;
};

type Summary = {
  total: number;
  by_tier: Record<string, number>;
  by_assurance_level: Record<string, number>;
  by_facet: Record<string, number>;
  as_of_earliest: string | null;
  as_of_latest: string | null;
};

type ArchiveResp = { client_id: string; entries: Entry[]; summary: Summary };

// --- Etiketter (sv) -----------------------------------------------------------

const ASSURANCE_SV: Record<string, string> = {
  independently_assured: 'Oberoende säkerställt',
  third_party_reviewed: 'Tredjepartsgranskat',
  self_declared: 'Företagets egen uppgift',
};

const ASSURANCE_TONE: Record<string, 'ok' | 'info' | 'warn'> = {
  independently_assured: 'ok',
  third_party_reviewed: 'info',
  self_declared: 'warn',
};

const CHECK_SV: { key: keyof Checks; label: string }[] = [
  { key: 'independence', label: 'Oberoende' },
  { key: 'methodology', label: 'Metodik' },
  { key: 'freshness', label: 'Färskhet' },
  { key: 'traceability', label: 'Spårbarhet' },
];

function tierBadge(e: Entry) {
  if (e.assurance_level) {
    return (
      <UI.Badge tone={ASSURANCE_TONE[e.assurance_level] ?? 'neutral'}>
        {ASSURANCE_SV[e.assurance_level] ?? e.assurance_level}
      </UI.Badge>
    );
  }
  return <UI.Badge tone="accent">Källcitat (grundat)</UI.Badge>;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Detaljvy per post --------------------------------------------------------

function EntryDetail({ e }: { e: Entry }) {
  return (
    <div style={{ padding: '12px 0 4px', display: 'grid', gap: 12 }}>
      {e.verification && (
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginBottom: 8 }}>
            Geogiraph-kontroller
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {CHECK_SV.map(({ key, label }) => {
              const ok = e.verification?.checks?.[key] === true;
              return (
                <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: ok ? '#16a34a' : C.dim }}>
                  {ok ? <Check size={14} /> : <X size={14} />} {label}
                </span>
              );
            })}
          </div>
          {e.verification.verification_text && (
            <p style={{ fontSize: 12, color: C.text, margin: '10px 0 0', lineHeight: 1.5 }}>{e.verification.verification_text}</p>
          )}
        </div>
      )}

      {e.source.quote && (
        <div style={{ borderLeft: `3px solid ${C.border}`, paddingLeft: 12 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginBottom: 4 }}>
            <Quote size={12} /> Verbatim ur källan
          </div>
          <p style={{ fontSize: 13, color: C.text, margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>”{e.source.quote}”</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12, color: C.muted }}>
        <span><strong style={{ color: C.text }}>Källa:</strong> {e.source.label || e.source.kind || '—'}</span>
        {e.verification?.instrument_or_issuer && <span><strong style={{ color: C.text }}>Utfärdare:</strong> {e.verification.instrument_or_issuer}</span>}
        {e.verification?.verified_by && <span><strong style={{ color: C.text }}>Verifierad av:</strong> {e.verification.verified_by}</span>}
        {e.verification?.expires_at && <span><strong style={{ color: C.text }}>Giltig t.o.m.:</strong> {e.verification.expires_at.slice(0, 10)}</span>}
        {e.source.url && (
          <a href={e.source.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.accent }}>
            <ExternalLink size={12} /> Öppna källa
          </a>
        )}
      </div>
    </div>
  );
}

// --- Sida ---------------------------------------------------------------------

export default function ProofArchivePage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<ArchiveResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState<'all' | 'assured' | 'grounded'>('all');
  const [assurance, setAssurance] = useState<string>('all');
  // Månads-deeplink från kvittot: ?month=YYYY-MM → date_from/date_to-fönster
  // mot backendens as_of-axel. Lexikografisk: YYYY-MM-31 fångar hela månaden.
  const [month, setMonth] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Klient-val delas med AI-synlighet (samma localStorage-nyckel) — växlar man
  // kund där landar man rätt här också. ?client=… har företräde (deep-link).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const c = params.get('client') || window.localStorage.getItem(LS_CLIENT);
    if (c) setSelected(c);
    const m = params.get('month');
    if (m && /^\d{4}-\d{2}$/.test(m)) setMonth(m);
  }, []);

  // Rensa månadsfiltret — och rensa även ut ?month= ur URL:en så reload inte
  // återinför det. Behåll ?client=.
  function clearMonth() {
    setMonth(null);
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.delete('month');
    const qs = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }

  useEffect(() => {
    graphFetch<{ clients: Client[] }>('/api/clients')
      .then((d) => {
        setClients(d.clients);
        if (d.clients.length && !selected) {
          const saved = typeof window !== 'undefined' ? window.localStorage.getItem(LS_CLIENT) : null;
          setSelected(saved && d.clients.find((c) => c.client_id === saved) ? saved : d.clients[0].client_id);
        }
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && selected) window.localStorage.setItem(LS_CLIENT, selected);
  }, [selected]);

  // Hämta arkivet. Filter byggs i query — backend filtrerar (services/proof_archive).
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (tier !== 'all') params.set('tier', tier);
    if (assurance !== 'all') params.set('assurance_level', assurance);
    if (month) {
      params.set('date_from', `${month}-01`);
      params.set('date_to', `${month}-31`);
    }
    const qs = params.toString();
    graphFetch<ArchiveResp>(`/api/proof-archive/${selected}${qs ? `?${qs}` : ''}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setData(null);
        setError(e.message);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selected, tier, assurance, month]);

  async function exportArchive() {
    if (!selected) return;
    try {
      const full = await graphFetch<unknown>(`/api/proof-archive/${selected}/export`);
      downloadJson(`bevisarkiv-${selected}.json`, full);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const summary = data?.summary;
  const entries = data?.entries ?? [];
  const dateRange = useMemo(() => {
    if (!summary?.as_of_earliest && !summary?.as_of_latest) return '—';
    return `${(summary?.as_of_earliest ?? '').slice(0, 10) || '?'} → ${(summary?.as_of_latest ?? '').slice(0, 10) || '?'}`;
  }, [summary]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <GraphPageShell
      title="Bevisarkiv"
      icon={<ShieldCheck size={22} />}
      subtitle="Tidsstämplad, granskningsbar provenans för varje verifierat påstående om kunden — klickbart hela vägen till källcitatet. Visar bara det vi går i god för."
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={selected ?? ''} onChange={(e) => setSelected(e.target.value)} style={selectStyle}>
          {clients.map((c) => (
            <option key={c.client_id} value={c.client_id}>
              {c.company_name || c.client_id}
            </option>
          ))}
        </select>
        <UI.SegmentedToggle
          value={tier}
          onChange={setTier}
          options={[
            { value: 'all', label: 'Alla' },
            { value: 'assured', label: 'Säkerställt' },
            { value: 'grounded', label: 'Grundat' },
          ]}
        />
        <select value={assurance} onChange={(e) => setAssurance(e.target.value)} style={selectStyle}>
          <option value="all">Alla nivåer</option>
          <option value="independently_assured">Oberoende säkerställt</option>
          <option value="third_party_reviewed">Tredjepartsgranskat</option>
          <option value="self_declared">Företagets egen uppgift</option>
        </select>
        <div style={{ flex: 1 }} />
        <UI.Button variant="ghost" icon={<Download size={14} />} onClick={exportArchive} disabled={!entries.length}>
          Exportera (JSON)
        </UI.Button>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      {/* Månadsfilter (deeplink från kvittot) — synligt scope-band med X för att rensa. */}
      {month && (
        <UI.StatusBanner tone="info" style={{ marginBottom: 16 }}>
          Filtrerar på månad <strong>{month}</strong> — visar bara verifierade påståenden med <em>as_of</em> i den månaden.{' '}
          <button
            type="button"
            onClick={clearMonth}
            aria-label="Rensa månadsfilter"
            title="Rensa månadsfilter"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8, padding: '2px 6px',
              background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit',
              fontSize: 12, textDecoration: 'underline',
            }}
          >
            <X size={12} /> Visa alla månader
          </button>
        </UI.StatusBanner>
      )}

      {/* Summary-rad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <UI.StatTile label="Verifierade påståenden" value={summary?.total ?? '—'} sub="i arkivet (efter filter)" />
        <UI.StatTile label="Oberoende säkerställt" value={summary?.by_assurance_level?.independently_assured ?? 0} tone="ok" />
        <UI.StatTile label="Företagets egen uppgift" value={summary?.by_assurance_level?.self_declared ?? 0} tone="attention" sub="märkt — ej demonstrerat" />
        <UI.StatTile label="Tidsspann" value={dateRange} size={16} />
      </div>

      {loading && <UI.SkeletonCard lines={4} />}

      {!loading && entries.length === 0 && !error && (
        <div style={cardStyle}>
          <UI.Empty icon={<ShieldCheck size={20} />} hint="Verifierade påståenden dyker upp här efter att bevis attesterats eller grundats mot källa.">
            Inga verifierade påståenden matchar det valda filtret än.
          </UI.Empty>
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div style={cardStyle}>
          {entries.map((e, i) => {
            const open = expanded.has(e.claim_id);
            return (
              <div key={e.claim_id} style={{ borderBottom: i < entries.length - 1 ? `1px solid ${C.border}` : 'none', padding: '12px 0' }}>
                <div {...UI.toggleProps(open, () => toggle(e.claim_id))} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                  <UI.Chevron open={open} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{e.statement}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      {tierBadge(e)}
                      {e.facet === 'culture' && <UI.Badge tone="neutral">Kultur{e.dimension ? ` · ${e.dimension}` : ''}</UI.Badge>}
                      <span style={{ fontSize: 11, color: C.dim }}>{e.as_of ? e.as_of.slice(0, 10) : 'utan datum'}</span>
                    </div>
                  </div>
                </div>
                {open && <EntryDetail e={e} />}
              </div>
            );
          })}
        </div>
      )}
    </GraphPageShell>
  );
}
