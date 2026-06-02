'use client';

/**
 * Uppladdning av officiell, attesterad data (vi har hämtat filen från källan).
 *
 * En kort per källtyp. Läget (replace/append) är en egenskap hos källtypen och
 * visas tydligt så operatören vet vad uppladdningen gör:
 *   - replace → "Ersätter" all tidigare data för källan (ögonblicksbild).
 *   - append  → "Läggs till" befintlig data (logg).
 *
 * Återanvändbar: används på kunddetalj-sidan (löpande) och kan droppas in i
 * onboarding-flödet (vid uppsättning). Talar med /api/attested/* (routers/attested.py).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { UploadCloud, FileCheck2, RefreshCw, PlusCircle, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { graphColors as C } from './GraphPageShell';
import { graphFetch } from '../_lib/api';

// Filtyper + label-text per källtyp — text-baserade källor (people_bio) tar PDF/text,
// LinkedIn-export-källor tar XLS/CSV.
const FILE_HINTS: Record<string, { accept: string; label: string }> = {
  people_bio: {
    accept: '.pdf,.txt,.md',
    label: 'Dra PDF eller textfil med personbiografier hit, eller klicka',
  },
};
const DEFAULT_FILE_HINT = {
  accept: '.csv,.tsv,.txt,.xls,.xlsx',
  label: 'Dra fil hit (LinkedIn-export .xls/.xlsx eller CSV) eller klicka',
};

type SourceType = {
  key: string;
  label: string;
  description: string;
  mode: 'replace' | 'append';
  included: number;
  staged: number;
  last_attested_at: string | null;
  samples: string[];
};

type UploadResult = { written: number; removed: number; mode: string; attested_at: string };

const MONTHS = ['jan', 'feb', 'mars', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso.slice(0, 10);
}

export default function AttestedUpload({ clientId }: { clientId: string }) {
  const [sources, setSources] = useState<SourceType[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await graphFetch<{ source_types: SourceType[] }>(`/api/attested/${clientId}/status`);
      setSources(data.source_types);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;
    graphFetch<{ source_types: SourceType[] }>(`/api/attested/${clientId}/status`)
      .then((d) => { if (!cancelled) setSources(d.source_types); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [clientId]);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#3a4b56', marginBottom: 4 }}>Officiell data (attesterad)</div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
        Filer vi själva hämtat från officiell källa. Vi datumsätter och går i god för att datan är oförvanskad.
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: '#b91c1c', fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {sources === null ? (
        <div style={{ fontSize: 12, color: C.muted }}>Laddar…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sources.map((st) => (
            <SourceUploader key={st.key} clientId={clientId} source={st} onDone={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function SourceUploader({ clientId, source, onDone }: { clientId: string; source: SourceType; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [attestedAt, setAttestedAt] = useState(today);
  const [url, setUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [including, setIncluding] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [clearing, setClearing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const replace = source.mode === 'replace';
  const fileHint = FILE_HINTS[source.key] || DEFAULT_FILE_HINT;
  const hasData = source.staged > 0 || source.included > 0;

  async function includeInDelivery() {
    setIncluding(true);
    setErr(null);
    try {
      await graphFetch(`/api/attested/${clientId}/${source.key}/include`, { method: 'POST' });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setIncluding(false);
    }
  }

  async function clearAll() {
    if (!window.confirm(`Radera all data för "${source.label}"? Det tas bort från leveransen vid nästa kompilering.`)) return;
    setClearing(true);
    setErr(null);
    setResult(null);
    try {
      await graphFetch(`/api/attested/${clientId}/${source.key}`, { method: 'DELETE' });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setClearing(false);
    }
  }

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('attested_at', attestedAt);
      if (url.trim()) fd.append('url', url.trim());
      // Ingen Content-Type-header — browsern sätter multipart-boundary själv.
      const data = await graphFetch<UploadResult>(`/api/attested/${clientId}/${source.key}`, {
        method: 'POST',
        body: fd,
      });
      setResult(data);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#3a4b56', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileCheck2 size={15} color={C.accent} /> {source.label}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {hasData && (
            <button
              onClick={clearAll}
              disabled={clearing}
              title="Radera all data för källan"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: 'transparent', color: '#b91c1c', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: clearing ? 'wait' : 'pointer' }}
            >
              <Trash2 size={11} /> {clearing ? 'Raderar…' : 'Rensa'}
            </button>
          )}
          <ModeBadge replace={replace} />
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>{source.description}</div>

      <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
        {source.staged > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ color: '#b45309', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={13} /> Uppladdat{source.last_attested_at ? ` ${fmtDate(source.last_attested_at)}` : ''} — {source.staged} datapunkter · väntar på bekräftelse
            </span>
            <button
              onClick={includeInDelivery}
              disabled={including}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'rgba(159,81,182,0.18)', color: '#9f51b6', border: '1px solid rgba(159,81,182,0.3)', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: including ? 'wait' : 'pointer' }}
            >
              <CheckCircle2 size={12} /> {including ? 'Inkluderar…' : 'Inkludera i leverans'}
            </button>
          </div>
        ) : source.included > 0 ? (
          <span style={{ color: '#16a34a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={13} /> Ingår i leverans{source.last_attested_at ? ` (sedan ${fmtDate(source.last_attested_at)})` : ''} — {source.included} datapunkter
          </span>
        ) : (
          <span style={{ fontStyle: 'italic' }}>Inget uppladdat än.</span>
        )}
        {source.samples.length > 0 && (
          <button onClick={() => setShowSamples((v) => !v)} style={{ marginLeft: 10, background: 'transparent', border: 'none', color: C.accent, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
            {showSamples ? 'Dölj exempel' : 'Visa exempel'}
          </button>
        )}
        {showSamples && (
          <ul style={{ margin: '6px 0 0', paddingLeft: 16, color: C.muted, lineHeight: 1.5 }}>
            {source.samples.map((s, i) => (
              <li key={i} style={{ marginBottom: 2 }}>{s.length > 110 ? s.slice(0, 110) + '…' : s}</li>
            ))}
          </ul>
        )}
      </div>

      {/* attesterat datum + valfri publik url */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>
          Attesterat datum
          <input
            type="date"
            value={attestedAt}
            onChange={(e) => setAttestedAt(e.target.value)}
            style={{ display: 'block', marginTop: 4, padding: '6px 10px', background: '#eef0f1', color: '#3a4b56', border: '1px solid #dfe3e7', borderRadius: 6, fontSize: 12, outline: 'none' }}
          />
        </label>
        <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, flex: 1, minWidth: 180 }}>
          Publik ankare (valfritt, t.ex. LinkedIn-sidan)
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.linkedin.com/company/…"
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', background: '#eef0f1', color: '#3a4b56', border: '1px solid #dfe3e7', borderRadius: 6, fontSize: 12, outline: 'none' }}
          />
        </label>
      </div>

      {/* drag-drop / klick */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
        onClick={() => !busy && fileInput.current?.click()}
        style={{
          background: dragOver ? 'rgba(159,81,182,0.08)' : '#f7f8f9',
          border: `2px dashed ${dragOver ? C.accent : C.border}`,
          borderRadius: 10,
          padding: '18px 16px',
          textAlign: 'center',
          cursor: busy ? 'wait' : 'pointer',
          transition: 'all 0.15s',
          opacity: busy ? 0.6 : 1,
        }}
      >
        <UploadCloud size={22} color={C.muted} />
        <div style={{ fontSize: 12, fontWeight: 600, color: '#3a4b56', marginTop: 4 }}>
          {busy ? 'Laddar upp…' : fileHint.label}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={fileHint.accept}
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = '';
          }}
        />
      </div>

      {replace && (
        <div style={{ fontSize: 11, color: '#b45309', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertCircle size={13} /> Ny uppladdning ersätter all tidigare data för den här källan.
        </div>
      )}

      {err && (
        <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 8 }}>{err}</div>
      )}
      {result && (
        <div style={{ fontSize: 12, color: '#16a34a', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle2 size={14} /> {result.written} datapunkter skrivna
          {result.removed > 0 && ` · ${result.removed} ersatta`}.
        </div>
      )}
    </div>
  );
}

function ModeBadge({ replace }: { replace: boolean }) {
  const Icon = replace ? RefreshCw : PlusCircle;
  const bg = replace ? 'rgba(245,158,11,0.15)' : 'rgba(37,99,235,0.12)';
  const fg = replace ? '#b45309' : '#2563eb';
  const text = replace ? 'Ersätter' : 'Läggs till';
  return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: bg, color: fg, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      <Icon size={11} /> {text}
    </span>
  );
}
