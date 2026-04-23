'use client';
import { useEffect, useRef, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const C = {
  bg: '#0a0a0f', card: '#12121a', border: 'rgba(255,255,255,0.08)',
  accent: '#a855f7', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444',
  text: '#f8fafc', muted: 'rgba(255,255,255,0.5)', dim: 'rgba(255,255,255,0.3)',
};

type LogEntry = {
  ts: string;
  level: 'INFO' | 'WARNING' | 'ERROR' | string;
  logger: string;
  event: string;
  [k: string]: any;
};

const levelColor: Record<string, string> = {
  INFO: C.accent, WARNING: C.warning, ERROR: C.danger, DEBUG: C.dim,
};

export default function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState('');
  const timer = useRef<any>(null);

  async function fetchLogs() {
    const url = `${API}/api/logs?limit=400${level ? `&level=${level}` : ''}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch (e) { /* ignore */ }
  }

  useEffect(() => {
    fetchLogs();
    if (autoRefresh) {
      timer.current = setInterval(fetchLogs, 2500);
      return () => clearInterval(timer.current);
    }
  }, [autoRefresh, level]);

  async function clearLogs() {
    if (!confirm('Rensa alla loggar i minnet?')) return;
    await fetch(`${API}/api/logs`, { method: 'DELETE' });
    fetchLogs();
  }

  const filtered = filter
    ? entries.filter(e => JSON.stringify(e).toLowerCase().includes(filter.toLowerCase()))
    : entries;

  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 60px', fontFamily: "'Inter', system-ui, sans-serif", color: C.text }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>🪵 Loggar</h1>
        <p style={{ fontSize: '0.8125rem', color: C.muted, margin: '4px 0 0' }}>
          Senaste händelser från backend (in-memory, senaste 1000). Varje rad är ett strukturerat event.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={level} onChange={e => setLevel(e.target.value)} style={inp}>
          <option value="">Alla nivåer</option>
          <option value="INFO">INFO</option>
          <option value="WARNING">WARNING</option>
          <option value="ERROR">ERROR</option>
        </select>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter (matchar hela raden)" style={{ ...inp, minWidth: 300, flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} /> Auto (2.5s)
        </label>
        <button onClick={fetchLogs} style={btn('ghost')}>↻</button>
        <button onClick={clearLogs} style={btn('danger')}>Rensa</button>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: 8, fontSize: 11, color: C.muted, borderBottom: `1px solid ${C.border}`, display: 'grid', gridTemplateColumns: '180px 80px 200px 1fr', gap: 10, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
          <div>Tidpunkt</div><div>Nivå</div><div>Event</div><div>Kontext</div>
        </div>
        <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 13 }}>Inga loggar än. Gör en upload eller skapa något för att se events här.</div>
          ) : [...filtered].reverse().map((e, i) => {
            const { ts, level: lvl, event, logger: _lg, ...rest } = e;
            return (
              <div key={i} style={{ padding: '8px 10px', fontSize: 11, borderBottom: `1px solid ${C.border}`, display: 'grid', gridTemplateColumns: '180px 80px 200px 1fr', gap: 10, alignItems: 'start', fontFamily: 'monospace' }}>
                <div style={{ color: C.dim }}>{new Date(ts).toLocaleTimeString()}.{ts.split('.')[1]?.slice(0, 3) || '000'}</div>
                <div style={{ color: levelColor[lvl] || C.muted, fontWeight: 700 }}>{lvl}</div>
                <div style={{ color: C.text }}>{event}</div>
                <div style={{ color: C.muted, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {Object.entries(rest).map(([k, v]) => (
                    <span key={k} style={{ marginRight: 14 }}>
                      <span style={{ color: C.dim }}>{k}=</span>
                      <span>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.dim, marginTop: 8 }}>
        Visar {filtered.length} av {entries.length} rader · stdout-loggar är också JSON-formaterade för server-sidig aggregering
      </div>
    </main>
  );
}

const inp: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, color: C.text, fontSize: 13, fontFamily: 'inherit' };

function btn(kind: 'accent' | 'ghost' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'inherit' };
  if (kind === 'accent') return { ...base, background: C.accent, color: '#fff' };
  if (kind === 'danger') return { ...base, background: 'rgba(239,68,68,0.12)', color: C.danger, borderColor: 'rgba(239,68,68,0.3)' };
  return { ...base, background: 'transparent', color: C.muted, borderColor: C.border };
}
