"use client";

import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Activity, Users, Target, Shield, Play, BrainCircuit, Briefcase, TrendingUp, Link2, FileText, CheckCircle2 } from 'lucide-react';

// ------------------- Types -------------------
interface SimulationMetrics {
  p10: number;
  p50: number;
  p90: number;
}

interface HistogramBin {
  value: number;
  probability: number;
}

interface DomainData {
  histogram: HistogramBin[];
  [key: string]: any;
}

interface SimulationData {
  sales: DomainData;
  recruiting: DomainData;
  valuation: DomainData;
}

// ------------------- Metric Card -------------------
function MetricCard({ title, value, p10, p90, icon: Icon, highlight }: {
  title: string; value: string | number; p10: string | number; p90: string | number;
  icon: any; highlight?: boolean;
}) {
  return (
    <div className={`p-6 rounded-2xl border relative overflow-hidden transition-all ${
      highlight
        ? "bg-purple-500/10 border-purple-500/30 shadow-[0_0_30px_rgba(168,85,247,0.15)]"
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

// ------------------- LinkedIn SVG Icon -------------------
function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

// ------------------- Main App -------------------
export default function Dashboard() {
  // LinkedIn Raw Input
  const [rawData, setRawData] = useState("");

  // Parsed / Manual Inputs
  const [followers, setFollowers] = useState(8500);
  const [impressions90d, setImpressions90d] = useState(120000);
  const [engagementRate, setEngagementRate] = useState(0.045);

  // Model Parameters
  const [networkDensity, setNetworkDensity] = useState(0.3);
  const [lurkerRatio, setLurkerRatio] = useState(0.8);
  const [trustMultiplier, setTrustMultiplier] = useState(1.0);

  const [result, setResult] = useState<SimulationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'sales' | 'recruiting' | 'valuation'>('sales');

  const handleRawDataParse = () => {
    if (rawData.length > 10) {
      setImpressions90d(Math.floor(Math.random() * 200000) + 50000);
      setFollowers(Math.floor(Math.random() * 15000) + 2000);
      setEngagementRate(parseFloat(((Math.random() * 0.08) + 0.01).toFixed(3)));
    }
  };

  const runSimulation = async () => {
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/simulate`, {
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
      if (json.status === "success") {
        setResult(json.data);
      }
    } catch (err) {
      console.error(err);
      alert("Kunde inte ansluta till Matematikmotorn. Är backend igång på port 8000?");
    }
    setLoading(false);
  };

  const currentHistogram = result ? result[activeTab].histogram : [];
  const chartColor = activeTab === 'sales' ? '#a855f7' : activeTab === 'recruiting' ? '#22c55e' : '#ec4899';

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100 flex flex-col" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header is now in the global Navbar */}

      <main className="flex-1 flex overflow-hidden">
        {/* LEFT SIDEBAR — INPUTS */}
        <aside className="w-[420px] flex-shrink-0 border-r border-white/[0.06] flex flex-col bg-[#0d0d14]">
          <div className="flex-1 overflow-y-auto p-6 space-y-7">

            {/* LINKEDIN DATA HUB */}
            <div className="bg-white/[0.02] p-5 rounded-2xl border border-purple-500/20">
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2 text-purple-200">
                <LinkedInIcon className="w-4 h-4 text-purple-400" />
                LinkedIn Data Hub
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1.5 flex justify-between items-center">
                    <span>Klistra in rapport (JSON / Text)</span>
                    <button onClick={handleRawDataParse} className="text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider">
                      <FileText className="w-3 h-3" /> Parsa
                    </button>
                  </label>
                  <textarea
                    value={rawData}
                    onChange={(e) => setRawData(e.target.value)}
                    placeholder="Klistra in insikter från LinkedIn Analytics..."
                    className="w-full h-16 bg-black/30 border border-white/[0.08] rounded-xl p-3 text-sm focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all resize-none font-mono text-slate-300 placeholder:text-slate-600"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/[0.06]"></div>
                  <span className="text-[10px] text-slate-600 font-semibold tracking-widest">ELLER MANUELLT</span>
                  <div className="h-px flex-1 bg-white/[0.06]"></div>
                </div>

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
            </div>

            {/* ABM PARAMETERS */}
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
              className="w-full py-4 bg-purple-600 hover:bg-purple-500 transition-all rounded-xl font-semibold flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(168,85,247,0.25)] hover:shadow-[0_0_40px_rgba(168,85,247,0.45)] disabled:opacity-50 text-white"
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

        {/* RIGHT CONTENT — VISUALIZATION */}
        <section className="flex-1 relative flex flex-col bg-[#0a0a0f]">

          {!result ? (
            <div className="flex-1 flex flex-col items-center justify-center relative z-10 p-12">
              <div className="relative mb-10">
                <div className="absolute inset-0 bg-purple-600 blur-[120px] opacity-15 rounded-full scale-150"></div>
                <BrainCircuit className="w-28 h-28 text-slate-800 relative" />
              </div>
              <h2 className="text-3xl font-bold text-slate-500 mb-3">Mata in data för att starta</h2>
              <p className="text-slate-600 mb-10">Ställ in LinkedIn-data och beteendeparametrar, sedan tryck Kör Simulering</p>
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

              {/* Tabs */}
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

              {/* KPI Cards */}
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

              {/* CHART */}
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
                      <YAxis
                        stroke="#ffffff20"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
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

              {/* Insight Box */}
              <div className="bg-purple-500/[0.06] border border-purple-500/20 p-5 rounded-xl flex items-start gap-4">
                <div className="bg-purple-500/15 p-2 rounded-lg flex-shrink-0">
                  <BrainCircuit className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h4 className="text-purple-300 font-semibold text-sm">Systeminsikt</h4>
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
