"use client";

import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Activity, Users, Target, Shield, Play, BrainCircuit, Briefcase, TrendingUp, Database, CheckCircle2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SimulationMetrics { p10: number; p50: number; p90: number; }
interface HistogramBin { value: number; probability: number; }
interface DomainData { histogram: HistogramBin[]; [key: string]: any; }
interface SimulationData { sales: DomainData; recruiting: DomainData; valuation: DomainData; }

type Customer = { id: string; name: string; logo_emoji?: string };
type Field    = { id: string; key: string; display_name: string; unit: string; data_type: string };
type Source   = { source_key: string; source_name: string; source_platform: string; source_category: string; dataset_count: number; fields: Field[] };
type Timeseries = { fields: Field[]; data: Record<string, any>[] };

// ─── Auto-fill from timeseries ─────────────────────────────────────────────────
function findField(fields: Field[], patterns: RegExp[]): Field | undefined {
  for (const re of patterns) {
    const f = fields.find(x => re.test(x.key) || re.test(x.display_name));
    if (f) return f;
  }
  return undefined;
}

function extractFromTimeseries(ts: Timeseries, daysBack = 90): {
  followers?: number;
  impressions?: number;
  engagementRate?: number;
  source: { followers?: string; impressions?: string; engagementRate?: string };
} {
  const out: ReturnType<typeof extractFromTimeseries> = { source: {} };
  if (!ts.data.length) return out;

  const cutoff = new Date(Date.now() - daysBack * 86_400_000);
  const recent = ts.data.filter(r => new Date(r.date) >= cutoff);
  const usable = recent.length > 0 ? recent : ts.data;

  const followerField  = findField(ts.fields, [/total[_ ]?follower/i, /follower/i]);
  const impressionField = findField(ts.fields, [/^impression/i, /total[_ ]?impression/i, /impression/i]);
  const rateField       = findField(ts.fields, [/engagement[_ ]?rate/i, /^ctr$/i, /engagement.*%/i]);

  if (followerField) {
    // Snapshot — latest non-null
    for (let i = usable.length - 1; i >= 0; i--) {
      const v = usable[i][followerField.key];
      if (typeof v === 'number') { out.followers = v; out.source.followers = followerField.display_name; break; }
    }
  }

  if (impressionField) {
    // Cumulative — sum
    const sum = usable.reduce((acc, r) => acc + (typeof r[impressionField.key] === 'number' ? r[impressionField.key] : 0), 0);
    if (sum > 0) { out.impressions = Math.round(sum); out.source.impressions = impressionField.display_name; }
  }

  if (rateField) {
    const vals = usable.map(r => r[rateField.key]).filter((v): v is number => typeof v === 'number');
    if (vals.length) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      out.engagementRate = avg > 1 ? avg / 100 : avg;  // normalize 4.5 → 0.045
      out.source.engagementRate = rateField.display_name;
    }
  }

  return out;
}

// ─── Metric Card ───────────────────────────────────────────────────────────────
function MetricCard({ title, value, p10, p90, icon: Icon, highlight }: {
  title: string; value: string | number; p10: string | number; p90: string | number;
  icon: any; highlight?: boolean;
}) {
  return (
    <div className={`p-6 rounded-2xl border relative overflow-hidden transition-all ${
      highlight
        ? "bg-purple-500/10 border-purple-500/30 shadow-[0_0_30px_rgba(0,212,255,0.15)]"
        : "bg-white/[0.03] border-white/[0.06]"
    }`}>
      {highlight && <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent"></div>}
      <div className="absolute top-0 right-0 p-4 opacity-[0.06]">
        <Icon className="w-24 h-24" />
      </div>
      <div className={`flex items-center gap-2 mb-2 relative ${highlight ? 'text-purple-300' : 'text-slate-400'}`}>
        <Icon className="w-4 h-4" />
        <span className="font-medium text-sm">{title} (P50)</span>
      </div>
      <div className={`text-4xl font-bold font-mono relative ${highlight ? 'text-white' : 'text-slate-100'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className={`mt-4 flex justify-between text-xs relative ${highlight ? 'text-purple-300/50' : 'text-slate-600'}`}>
        <span>Worst: {typeof p10 === 'number' ? p10.toLocaleString() : p10}</span>
        <span>Best: {typeof p90 === 'number' ? p90.toLocaleString() : p90}</span>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function EnginePage() {
  // Data-picker state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [pickerLoading, setPickerLoading] = useState(false);
  const [appliedSummary, setAppliedSummary] = useState<{ followers?: string; impressions?: string; engagementRate?: string } | null>(null);

  // Inputs
  const [followers, setFollowers] = useState(8500);
  const [impressions90d, setImpressions90d] = useState(120000);
  const [engagementRate, setEngagementRate] = useState(0.045);

  // Behavioral parameters
  const [networkDensity, setNetworkDensity] = useState(0.3);
  const [lurkerRatio, setLurkerRatio] = useState(0.8);
  const [trustMultiplier, setTrustMultiplier] = useState(1.0);

  const [result, setResult] = useState<SimulationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'sales' | 'recruiting' | 'valuation'>('sales');

  // Load customers on mount
  useEffect(() => {
    fetch(`${API}/api/customers`).then(r => r.ok ? r.json() : []).then(setCustomers).catch(() => {});
  }, []);

  // Load sources when customer changes
  useEffect(() => {
    if (!selectedCustomer) { setSources([]); setSelectedSource(''); return; }
    fetch(`${API}/api/customers/${selectedCustomer}/sources`)
      .then(r => r.ok ? r.json() : [])
      .then(setSources)
      .catch(() => setSources([]));
    setSelectedSource('');
    setAppliedSummary(null);
  }, [selectedCustomer]);

  const applyFromSource = async () => {
    if (!selectedCustomer || !selectedSource) return;
    setPickerLoading(true);
    try {
      const src = sources.find(s => s.source_key === selectedSource);
      if (!src) return;
      const fieldKeys = src.fields
        .filter(f => f.data_type === 'int' || f.data_type === 'float')
        .map(f => f.key)
        .join(',');
      const params = new URLSearchParams({ bucket: 'daily', fields: fieldKeys });
      const res = await fetch(`${API}/api/customers/${selectedCustomer}/sources/${selectedSource}/timeseries?${params}`);
      if (!res.ok) return;
      const ts: Timeseries = await res.json();
      const extracted = extractFromTimeseries(ts, 90);
      if (extracted.followers != null) setFollowers(extracted.followers);
      if (extracted.impressions != null) setImpressions90d(extracted.impressions);
      if (extracted.engagementRate != null) setEngagementRate(parseFloat(extracted.engagementRate.toFixed(4)));
      setAppliedSummary(extracted.source);
    } finally {
      setPickerLoading(false);
    }
  };

  const runSimulation = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          followers,
          impressions_90d: impressions90d,
          linkedin_engagement_rate: engagementRate,
          network_density: networkDensity,
          lurker_ratio: lurkerRatio,
          trust_multiplier: trustMultiplier,
        })
      });
      const json = await res.json();
      if (json.status === "success") setResult(json.data);
    } catch (err) {
      console.error(err);
      alert("Kunde inte ansluta till Matematikmotorn. Är backend igång på port 8000?");
    }
    setLoading(false);
  };

  const currentHistogram = result ? result[activeTab].histogram : [];
  const chartColor = activeTab === 'sales' ? 'var(--brand-accent)' : activeTab === 'recruiting' ? '#22c55e' : '#ec4899';
  const customerName = customers.find(c => c.id === selectedCustomer)?.name;

  return (
    <div className="h-[calc(100vh-56px)] bg-[var(--brand-bg)] text-slate-100 flex flex-col overflow-hidden" style={{ fontFamily: "var(--brand-font-sans)" }}>
      <main className="flex-1 flex overflow-hidden min-h-0">

        {/* LEFT SIDEBAR — INPUTS */}
        <aside className="w-[420px] flex-shrink-0 border-r border-white/[0.06] flex flex-col bg-[#0d0d14] max-h-full">
          <div className="flex-1 overflow-y-auto p-6 space-y-7">

            {/* DATAKÄLLA — kund/källa-picker */}
            <div className="bg-white/[0.02] p-5 rounded-2xl border border-purple-500/20">
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2 text-purple-200">
                <Database className="w-4 h-4 text-purple-400" />
                Datakälla
              </h2>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">Kund</label>
                  <select
                    value={selectedCustomer}
                    onChange={e => setSelectedCustomer(e.target.value)}
                    className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all"
                  >
                    <option value="">Välj kund…</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.logo_emoji ?? '🏢'} {c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">Källa</label>
                  <select
                    value={selectedSource}
                    onChange={e => setSelectedSource(e.target.value)}
                    disabled={!selectedCustomer || sources.length === 0}
                    className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <option value="">{!selectedCustomer ? 'Välj kund först' : sources.length === 0 ? 'Inga källor' : 'Välj källa…'}</option>
                    {sources.map(s => (
                      <option key={s.source_key} value={s.source_key}>{s.source_name}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={applyFromSource}
                  disabled={!selectedSource || pickerLoading}
                  className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/30 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
                >
                  {pickerLoading ? (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Hämta värden från kund
                </button>

                {appliedSummary && (
                  <div className="text-[11px] text-purple-300/80 bg-purple-500/[0.06] border border-purple-500/15 rounded-lg p-3 space-y-0.5 leading-snug">
                    <div className="font-semibold text-purple-300 mb-1">✓ Värden hämtade</div>
                    {appliedSummary.followers && <div>Följare: <span className="text-slate-400">{appliedSummary.followers}</span></div>}
                    {appliedSummary.impressions && <div>Impressions: <span className="text-slate-400">{appliedSummary.impressions} (90d-summa)</span></div>}
                    {appliedSummary.engagementRate && <div>Engagement: <span className="text-slate-400">{appliedSummary.engagementRate} (snitt)</span></div>}
                    {!appliedSummary.followers && !appliedSummary.impressions && !appliedSummary.engagementRate && (
                      <div className="text-amber-300/80">Hittade inga matchande fält i källan. Justera manuellt nedan.</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* MANUELLA INPUTS */}
            <div>
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2 text-slate-300">
                LinkedIn-värden
                <span className="text-[10px] font-normal text-slate-600 normal-case tracking-normal">{customerName ? `· ${customerName}` : '· manuellt'}</span>
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">Totala Följare</label>
                  <input type="number" value={followers} onChange={e => setFollowers(Number(e.target.value))}
                    className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm font-mono text-white focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">Impressions (90d)</label>
                  <input type="number" value={impressions90d} onChange={e => setImpressions90d(Number(e.target.value))}
                    className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm font-mono text-white focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">Snitt Engagemangsgrad</label>
                  <div className="flex items-center gap-3">
                    <input type="range" min="0.001" max="0.15" step="0.001" value={engagementRate} onChange={e => setEngagementRate(Number(e.target.value))}
                      className="w-full h-1.5 bg-white/[0.06] rounded-full appearance-none accent-purple-500 cursor-pointer" />
                    <span className="text-sm font-mono text-purple-300 w-14 text-right">{(engagementRate * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* BEHAVIORAL */}
            <div>
              <h2 className="text-base font-semibold mb-5 flex items-center gap-2 text-slate-300">
                <BrainCircuit className="w-4 h-4 text-purple-400" />
                Beteendepsykologi
              </h2>
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="flex justify-between text-sm font-medium text-slate-400">
                    <span>Nätverksdensitet</span>
                    <span className="text-purple-300 font-mono text-xs">{networkDensity.toFixed(2)}</span>
                  </label>
                  <input type="range" min="0.01" max="1.0" step="0.01" value={networkDensity} onChange={e => setNetworkDensity(Number(e.target.value))}
                    className="w-full h-1.5 bg-white/[0.06] rounded-full appearance-none accent-purple-500 cursor-pointer" />
                  <p className="text-[10px] text-slate-600">Kluster 3: Grafteori — Hur sammanflätade kontakterna är.</p>
                </div>
                <div className="space-y-2">
                  <label className="flex justify-between text-sm font-medium text-slate-400">
                    <span>Lurker Ratio (Dark Social)</span>
                    <span className="text-purple-300 font-mono text-xs">{(lurkerRatio * 100).toFixed(0)}%</span>
                  </label>
                  <input type="range" min="0.5" max="0.99" step="0.01" value={lurkerRatio} onChange={e => setLurkerRatio(Number(e.target.value))}
                    className="w-full h-1.5 bg-white/[0.06] rounded-full appearance-none accent-purple-500 cursor-pointer" />
                  <p className="text-[10px] text-slate-600">Kluster 5: 95:5-regeln och Dark Social-konvertering.</p>
                </div>
                <div className="space-y-2">
                  <label className="flex justify-between text-sm font-medium text-slate-400">
                    <span>Trust Multiplier (Halo Effect)</span>
                    <span className="text-purple-300 font-mono text-xs">{trustMultiplier.toFixed(1)}x</span>
                  </label>
                  <input type="range" min="0.5" max="3.0" step="0.1" value={trustMultiplier} onChange={e => setTrustMultiplier(Number(e.target.value))}
                    className="w-full h-1.5 bg-white/[0.06] rounded-full appearance-none accent-purple-500 cursor-pointer" />
                  <p className="text-[10px] text-slate-600">Kluster 7: Auktoritetens multiplikatoreffekt (Edelman).</p>
                </div>
              </div>
            </div>
          </div>

          {/* RUN BUTTON */}
          <div className="p-6 border-t border-white/[0.06]">
            <button
              onClick={runSimulation}
              disabled={loading}
              className="brand-btn-primary w-full flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(0,212,255,0.25)] hover:shadow-[0_0_40px_rgba(0,212,255,0.45)]"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
              {loading ? 'Kör Monte Carlo (10k it)...' : 'Kör Simulering'}
            </button>
          </div>
        </aside>

        {/* RIGHT CONTENT */}
        <section className="flex-1 relative flex flex-col bg-[var(--brand-bg)]">
          {!result ? (
            <div className="flex-1 flex flex-col items-center justify-center relative z-10 p-12">
              <div className="relative mb-10">
                <div className="absolute inset-0 bg-purple-600 blur-[120px] opacity-15 rounded-full scale-150"></div>
                <BrainCircuit className="w-28 h-28 text-slate-800 relative" />
              </div>
              <h2 className="text-4xl font-normal tracking-tight text-slate-400 mb-3 brand-serif">Mata in data för att starta</h2>
              <p className="text-slate-600 mb-10">Välj kund + källa eller justera värden manuellt, sedan tryck Kör Simulering</p>
              <div className="flex gap-8">
                {[
                  { icon: Target, label: 'Sälj (Leads)' },
                  { icon: Users, label: 'Rekrytering' },
                  { icon: TrendingUp, label: 'Värdering' },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                      <item.icon className="w-5 h-5 text-slate-700" />
                    </div>
                    <span className="text-xs text-slate-600">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-8 relative z-10 space-y-6">
              <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl w-fit border border-white/[0.06]">
                {[
                  { key: 'sales' as const, label: 'Säljmotorn', icon: Target, color: 'purple' },
                  { key: 'recruiting' as const, label: 'Rekrytering', icon: Users, color: 'emerald' },
                  { key: 'valuation' as const, label: 'Bolagsvärdering', icon: TrendingUp, color: 'pink' },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all ${
                      activeTab === tab.key
                        ? tab.color === 'purple' ? 'bg-purple-600 text-white shadow-lg' :
                          tab.color === 'emerald' ? 'bg-emerald-600 text-white shadow-lg' :
                          'bg-pink-600 text-white shadow-lg'
                        : 'text-slate-500 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" /> {tab.label}
                  </button>
                ))}
              </div>

              <div key={activeTab}>
                {activeTab === 'sales' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <MetricCard title="Förväntad Räckvidd" value={Math.round(result.sales.reach.p50)} p10={Math.round(result.sales.reach.p10)} p90={Math.round(result.sales.reach.p90)} icon={Users} />
                    <MetricCard title="Organiskt Engagemang" value={Math.round(result.sales.engagements.p50)} p10={Math.round(result.sales.engagements.p10)} p90={Math.round(result.sales.engagements.p90)} icon={Activity} />
                    <MetricCard title="Pipeline Leads" value={Math.round(result.sales.leads.p50)} p10={Math.round(result.sales.leads.p10)} p90={Math.round(result.sales.leads.p90)} icon={Target} highlight />
                  </div>
                )}
                {activeTab === 'recruiting' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <MetricCard title="Passiva Kandidater" value={Math.round(result.recruiting.candidates.p50)} p10={Math.round(result.recruiting.candidates.p10)} p90={Math.round(result.recruiting.candidates.p90)} icon={Briefcase} />
                    <MetricCard title="Topp-rekryteringar" value={Math.round(result.recruiting.hires.p50)} p10={Math.round(result.recruiting.hires.p10)} p90={Math.round(result.recruiting.hires.p90)} icon={Users} highlight />
                  </div>
                )}
                {activeTab === 'valuation' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <MetricCard title="SoV Impressions" value={Math.round(result.valuation.impressions.p50)} p10={Math.round(result.valuation.impressions.p10)} p90={Math.round(result.valuation.impressions.p90)} icon={Shield} />
                    <MetricCard title="Brand Equity (USD)" value={`$${Math.round(result.valuation.brand_equity_usd.p50).toLocaleString()}`} p10={`$${Math.round(result.valuation.brand_equity_usd.p10).toLocaleString()}`} p90={`$${Math.round(result.valuation.brand_equity_usd.p90).toLocaleString()}`} icon={TrendingUp} highlight />
                  </div>
                )}
              </div>

              <div className="bg-white/[0.02] p-6 rounded-2xl border border-white/[0.06]">
                <div className="mb-5">
                  <h3 className="text-base font-semibold text-slate-200">
                    Distributionskurva: {activeTab === 'sales' ? 'Genererade Leads' : activeTab === 'recruiting' ? 'Top Hires' : 'Brand Equity ($)'}
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">Stokastisk simulering · {currentHistogram.reduce((acc: number, curr: HistogramBin) => acc + curr.probability, 0).toLocaleString()} iterationer</p>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={currentHistogram} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={chartColor} stopOpacity={0.5} />
                          <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                      <XAxis
                        dataKey="value"
                        stroke="#ffffff30"
                        fontSize={11}
                        tickFormatter={(val: number) => {
                          const n = Math.round(val);
                          return activeTab === 'valuation' ? `$${n.toLocaleString()}` : n.toLocaleString();
                        }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis stroke="#ffffff20" fontSize={11} tickLine={false} axisLine={false} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: '#111118', borderColor: '#ffffff15', borderRadius: '10px', fontSize: '12px' }}
                        cursor={{ stroke: '#ffffff10', strokeWidth: 1 }}
                        formatter={(value: any) => [`${value} simuleringar`, 'Frekvens']}
                        labelFormatter={(label: any) => {
                          const val = Math.round(Number(label));
                          return activeTab === 'valuation' ? `$${val.toLocaleString()}` : val.toLocaleString();
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="probability"
                        stroke={chartColor}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#chartGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-purple-500/[0.06] border border-purple-500/20 p-5 rounded-xl flex items-start gap-4">
                <div className="bg-purple-500/15 p-2 rounded-lg flex-shrink-0">
                  <BrainCircuit className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h4 className="text-purple-300 font-semibold text-sm">
                    Systeminsikt{customerName ? ` · ${customerName}` : ''}
                  </h4>
                  <p className="text-purple-300/70 text-sm mt-1 leading-relaxed">
                    {activeTab === 'sales' && `Med en Trust Multiplier på ${trustMultiplier}x och ${(lurkerRatio * 100).toFixed(0)}% passiva läsare konverterar Dark Social-effekten tyst. Fokusera på C-level distribution för maximal pipeline-effekt.`}
                    {activeTab === 'recruiting' && `Halo Effect-faktorn (${trustMultiplier}x) avgör din förmåga att aktivera passiva kandidater. Starka arbetsgivarvarumärken konverterar lurkers till sökande utan att de någonsin engagerar sig synligt.`}
                    {activeTab === 'valuation' && `Brand Equity byggs genom Share of Voice-dominans. Med nätverksdensitet ${networkDensity.toFixed(2)} och ${Math.round(impressions90d * 4).toLocaleString()} annualiserade impressions skapar ni mätbar Goodwill.`}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
