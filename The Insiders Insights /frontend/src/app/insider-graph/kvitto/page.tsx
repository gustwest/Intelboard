'use client';

import { useEffect, useState } from 'react';
import { ReceiptText, Search, Wrench, CheckCircle2, Archive } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import * as UI from '../_components/ui';
import { graphFetch } from '../_lib/api';
import { Client, LS_CLIENT, PERSONA_SV, harmLabel, errorStyle, selectStyle } from '../polling/_shared';

// --- Typer som speglar /api/proof-receipt (services/proof_receipt.py) ---------

type DetectedItem = { question: string | null; engine: string | null; harm: string | null; severity: string | null; persona: string | null; detected_at: string | null };
type ResolvedItem = { question: string | null; engine: string | null; persona: string | null; clean_streak: number | null; resolved_at: string | null };
type RecommendedItem = { dimension: string | null; channel: string | null; status: string | null; created_at: string | null };

type Receipt = {
  client_id: string;
  month: string;
  company_name: string;
  quiet_month: boolean;
  headline: string;
  detected: { count: number; by_engine: Record<string, number>; by_harm: Record<string, number>; items: DetectedItem[] };
  recommended: { count: number; by_channel: Record<string, number>; items: RecommendedItem[] };
  resolved: { count: number; items: ResolvedItem[] };
  archive_growth: { new_this_month: number; total: number };
};

function chips(counts: Record<string, number>, fmt?: (k: string) => string) {
  const keys = Object.keys(counts);
  if (!keys.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
      {keys.map((k) => (
        <UI.Badge key={k} tone="neutral">
          {fmt ? fmt(k) : k} · {counts[k]}
        </UI.Badge>
      ))}
    </div>
  );
}

function row(left: React.ReactNode, meta: string, key: string | number) {
  return (
    <div key={key} style={{ padding: '10px 0', borderTop: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{left}</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{meta}</div>
    </div>
  );
}

export default function ProofReceiptPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [months, setMonths] = useState<string[] | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qs = new URLSearchParams(window.location.search).get('client');
    const c = qs || window.localStorage.getItem(LS_CLIENT);
    if (c) setSelected(c);
  }, []);

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

  // Tillgängliga månader ur rapportmotorn — kvittot delar månadsaxel med rapporten.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    graphFetch<{ months: string[] }>(`/api/reports/${selected}`)
      .then((d) => {
        if (cancelled) return;
        setMonths(d.months);
        setMonth(d.months[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setMonths([]);
          setMonth(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // Hämta kvittot. Saknas månad (ingen rapport än) → innevarande månad via no-month-rutten.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    const path = month ? `/api/proof-receipt/${selected}/${month}` : `/api/proof-receipt/${selected}`;
    graphFetch<Receipt>(path)
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
  }, [selected, month]);

  return (
    <GraphPageShell
      title="Månadens kvitto"
      icon={<ReceiptText size={22} />}
      subtitle="Vad vi upptäckte, rekommenderade och stängde den här månaden — med tidsstämplar. Ett kvitto på sanning, inte en klick-graf."
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={selected ?? ''} onChange={(e) => setSelected(e.target.value)} style={selectStyle}>
          {clients.map((c) => (
            <option key={c.client_id} value={c.client_id}>
              {c.company_name || c.client_id}
            </option>
          ))}
        </select>
        {months && months.length > 0 && (
          <select value={month ?? ''} onChange={(e) => setMonth(e.target.value)} style={selectStyle}>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <div style={errorStyle}>{error}</div>}
      {loading && <UI.SkeletonCard lines={4} />}

      {!loading && data && (
        <>
          <UI.StatusBanner tone={data.quiet_month ? 'ok' : 'info'} style={{ marginBottom: 16 }}>
            {data.headline}
          </UI.StatusBanner>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <UI.StatTile icon={<Search size={13} />} label="Upptäckt" value={data.detected.count} sub="risker denna månad" tone={data.detected.count ? 'attention' : undefined} />
            <UI.StatTile icon={<Wrench size={13} />} label="Rekommenderat" value={data.recommended.count} sub="åtgärder" />
            <UI.StatTile icon={<CheckCircle2 size={13} />} label="Stängt" value={data.resolved.count} sub="rena svar N cykler" tone={data.resolved.count ? 'ok' : undefined} />
            <UI.StatTile icon={<Archive size={13} />} label="Arkivet växte" value={`+${data.archive_growth.new_this_month}`} sub={`${data.archive_growth.total} totalt`} />
          </div>

          {/* Upptäckt */}
          <UI.Card style={{ marginBottom: 16 }} title="Upptäckt" hint="AI-svar som kan skada ett beslut — klassade mot skademodellen, med tidsstämpel.">
            {data.detected.count === 0 ? (
              <UI.Empty>Inga nya risker upptäcktes den här månaden.</UI.Empty>
            ) : (
              <>
                {chips(data.detected.by_engine)}
                {chips(data.detected.by_harm, harmLabel)}
                {data.detected.items.map((it, i) =>
                  row(
                    it.question || '—',
                    `${it.engine || '—'} · ${harmLabel(it.harm)} · ${it.persona ? PERSONA_SV[it.persona] || it.persona : '—'}${it.detected_at ? ` · ${it.detected_at.slice(0, 10)}` : ''}`,
                    i,
                  ),
                )}
              </>
            )}
          </UI.Card>

          {/* Rekommenderat */}
          <UI.Card style={{ marginBottom: 16 }} title="Rekommenderat" hint="Åtgärder vi formulerade för att möta gapen — kanal och dimension, inte perceptionstal.">
            {data.recommended.count === 0 ? (
              <UI.Empty>Inga nya åtgärder rekommenderades den här månaden.</UI.Empty>
            ) : (
              <>
                {chips(data.recommended.by_channel)}
                {data.recommended.items.map((it, i) =>
                  row(
                    `${it.dimension || '—'} → ${it.channel || '—'}`,
                    `${it.status || '—'}${it.created_at ? ` · ${it.created_at.slice(0, 10)}` : ''}`,
                    i,
                  ),
                )}
              </>
            )}
          </UI.Card>

          {/* Stängt */}
          <UI.Card title="Stängt" hint="Risker där motorernas svar varit rena flera cykler i rad — beviset på att gapet stängts.">
            {data.resolved.count === 0 ? (
              <UI.Empty>Inga risker stängdes den här månaden.</UI.Empty>
            ) : (
              data.resolved.items.map((it, i) =>
                row(
                  it.question || '—',
                  `${it.engine || '—'} · rena cykler: ${it.clean_streak ?? '—'}${it.resolved_at ? ` · stängd ${it.resolved_at.slice(0, 10)}` : ''}`,
                  i,
                ),
              )
            )}
          </UI.Card>
        </>
      )}
    </GraphPageShell>
  );
}
