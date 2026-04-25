'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './admin.module.css';

const SOURCE_TYPES = [
  { value: 'PORTAL', label: 'Portal (Puppeteer)' },
  { value: 'EMAIL', label: 'E-post (Gmail)' },
  { value: 'API', label: 'API' },
];

const INTERVALS = [
  { value: 15, label: 'Var 15 min' },
  { value: 30, label: 'Var 30 min' },
  { value: 60, label: 'Var timme' },
  { value: 120, label: 'Var 2:a timme' },
  { value: 360, label: 'Var 6:e timme' },
  { value: 1440, label: 'En gång per dag' },
];

export default function SourcesPanel() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [checking, setChecking] = useState(null); // source id being checked
  const [error, setError] = useState(null);

  // Check All state
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkAllResult, setCheckAllResult] = useState(null);

  // Form state
  const [form, setForm] = useState({
    name: '',
    type: 'PORTAL',
    url: '',
    domain: '',
    username: '',
    password: '',
    checkIntervalMin: 30,
  });

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/sources');
      if (res.ok) setSources(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchSources(); }, [fetchSources]);

  const resetForm = () => {
    setForm({ name: '', type: 'PORTAL', url: '', domain: '', username: '', password: '', checkIntervalMin: 30 });
    setEditId(null);
    setShowForm(false);
    setError(null);
  };

  const handleSave = async () => {
    setError(null);
    if (!form.name.trim()) { setError('Namn krävs'); return; }

    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password; // Don't send empty password on edit

      const url = editId ? `/api/admin/sources/${editId}` : '/api/admin/sources';
      const method = editId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Kunde inte spara');
        return;
      }

      resetForm();
      fetchSources();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = (source) => {
    setForm({
      name: source.name,
      type: source.type,
      url: source.url || '',
      domain: source.domain || '',
      username: source.username || '',
      password: '', // never pre-filled
      checkIntervalMin: source.checkIntervalMin,
    });
    setEditId(source.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Radera denna källa?')) return;
    await fetch(`/api/admin/sources/${id}`, { method: 'DELETE' });
    fetchSources();
  };

  const handleToggle = async (source) => {
    await fetch(`/api/admin/sources/${source.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !source.enabled }),
    });
    fetchSources();
  };

  const handleCheck = async (id) => {
    setChecking(id);
    try {
      const res = await fetch(`/api/admin/sources/${id}/check`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        alert(`✅ Kontroll klar! Hittade ${data.found} nya uppdrag.`);
      } else {
        alert(`❌ Fel: ${data.error || 'Okänt fel'}`);
      }
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
    setChecking(null);
    fetchSources();
  };

  const handleCheckAll = async () => {
    setCheckingAll(true);
    setCheckAllResult(null);
    try {
      const res = await fetch('/api/admin/sources/check-all', { method: 'POST' });
      const data = await res.json();
      setCheckAllResult(data);
    } catch (err) {
      setCheckAllResult({ ok: false, error: err.message });
    }
    setCheckingAll(false);
    fetchSources();
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return 'Aldrig';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just nu';
    if (mins < 60) return `${mins} min sedan`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h sedan`;
    return `${Math.floor(hours / 24)}d sedan`;
  };

  const enabledCount = sources.filter((s) => s.enabled).length;

  return (
    <div>
      {/* Header */}
      <div className={styles.panel}>
        <div className={styles.panelTitleRow}>
          <h2 className={styles.panelTitle}>📡 Mäklarkällor</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={styles.addBtn}
              onClick={handleCheckAll}
              disabled={checkingAll || enabledCount === 0}
              style={{
                background: checkingAll
                  ? 'rgba(251,191,36,0.15)'
                  : 'linear-gradient(135deg, rgba(52,211,153,0.15), rgba(96,165,250,0.15))',
                color: checkingAll ? '#fbbf24' : '#34d399',
                border: `1px solid ${checkingAll ? 'rgba(251,191,36,0.3)' : 'rgba(52,211,153,0.3)'}`,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {checkingAll ? (
                <>
                  <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
                  {' '}Hämtar uppdrag...
                </>
              ) : (
                <>🔄 Hämta alla ({enabledCount})</>
              )}
            </button>
            <button className={styles.addBtn} onClick={() => { resetForm(); setShowForm(true); }}>
              + Lägg till källa
            </button>
          </div>
        </div>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontSize: '0.85rem' }}>
          Konfigurera mäklarplattformar för automatisk hämtning av uppdrag. Inloggningsuppgifter lagras krypterat.
        </p>
      </div>

      {/* Check All Results */}
      {checkAllResult && (
        <div className={styles.panel} style={{
          borderLeft: checkAllResult.totals?.errors > 0
            ? '3px solid #f87171'
            : '3px solid #34d399',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem' }}>
              {checkAllResult.totals?.errors > 0 ? '⚠️' : '✅'} Hämtningsresultat
            </h3>
            <button
              onClick={() => setCheckAllResult(null)}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: '1.1rem', padding: '0 4px',
              }}
            >✕</button>
          </div>

          {/* Summary stats */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.75rem', margin: '0.75rem 0',
          }}>
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'rgba(52,211,153,0.08)', textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#34d399' }}>
                {checkAllResult.totals?.found || 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Nya uppdrag</div>
            </div>
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'rgba(96,165,250,0.08)', textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#60a5fa' }}>
                {checkAllResult.totals?.checked || 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Källor kontrollerade</div>
            </div>
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: checkAllResult.totals?.errors > 0
                ? 'rgba(248,113,113,0.08)' : 'rgba(148,163,184,0.08)',
              textAlign: 'center',
            }}>
              <div style={{
                fontSize: '1.4rem', fontWeight: 700,
                color: checkAllResult.totals?.errors > 0 ? '#f87171' : '#94a3b8',
              }}>
                {checkAllResult.totals?.errors || 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Fel</div>
            </div>
          </div>

          {/* Per-source details */}
          {checkAllResult.sources?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {checkAllResult.sources.map((s) => (
                <div key={s.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 10px', borderRadius: 6,
                  background: s.ok ? 'rgba(52,211,153,0.04)' : 'rgba(248,113,113,0.06)',
                  fontSize: '0.8rem',
                }}>
                  <span>
                    {s.ok ? '✅' : '❌'} {s.name}
                  </span>
                  <span style={{ display: 'flex', gap: '0.75rem', color: 'var(--text-muted)' }}>
                    {s.ok ? (
                      <>
                        <span style={{ color: '#34d399', fontWeight: 600 }}>{s.found} nya</span>
                        {s.total > 0 && <span>({s.total} totalt)</span>}
                      </>
                    ) : (
                      <span style={{ color: '#f87171', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.error}
                      </span>
                    )}
                    <span>{(s.elapsedMs / 1000).toFixed(1)}s</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div className={styles.panel} style={{ borderLeft: '3px solid var(--accent)' }}>
          <h3 className={styles.panelTitle}>{editId ? '✏️ Redigera källa' : '➕ Ny källa'}</h3>

          {error && <div style={{ color: '#ff6b6b', marginBottom: '0.75rem', fontSize: '0.85rem' }}>⚠️ {error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
            <div>
              <label className={styles.label}>Namn *</label>
              <input
                className={styles.input}
                placeholder="T.ex. Cinode, E-Work..."
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className={styles.label}>Typ</label>
              <select
                className={styles.input}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {SOURCE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={styles.label}>Portal-URL</label>
              <input
                className={styles.input}
                placeholder="https://app.cinode.com/..."
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
            </div>
            <div>
              <label className={styles.label}>E-postdomän (för Gmail-filter)</label>
              <input
                className={styles.input}
                placeholder="cinode.com"
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
              />
            </div>
            <div>
              <label className={styles.label}>Användarnamn / E-post</label>
              <input
                className={styles.input}
                placeholder="din.email@foretag.se"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div>
              <label className={styles.label}>Lösenord {editId ? '(lämna tomt = behåll)' : ''}</label>
              <input
                className={styles.input}
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div>
              <label className={styles.label}>Kontrollintervall</label>
              <select
                className={styles.input}
                value={form.checkIntervalMin}
                onChange={(e) => setForm({ ...form, checkIntervalMin: parseInt(e.target.value) })}
              >
                {INTERVALS.map((i) => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button className={styles.addBtn} onClick={handleSave}>
              {editId ? 'Spara ändringar' : 'Skapa källa'}
            </button>
            <button className={styles.cancelBtn} onClick={resetForm}>Avbryt</button>
          </div>
        </div>
      )}

      {/* Sources List */}
      {loading ? (
        <div className={styles.panel}><p style={{ color: 'var(--text-muted)' }}>Laddar...</p></div>
      ) : sources.length === 0 ? (
        <div className={styles.panel}>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>
            Inga källor konfigurerade. Klicka "Lägg till källa" för att komma igång.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {sources.map((s) => (
            <div key={s.id} className={styles.panel} style={{
              opacity: s.enabled ? 1 : 0.5,
              borderLeft: s.enabled ? '3px solid var(--accent)' : '3px solid var(--border)',
              transition: 'all 0.3s ease',
              ...(checkingAll && s.enabled ? { animation: 'pulse 2s ease-in-out infinite' } : {}),
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>
                      {s.type === 'PORTAL' ? '🌐' : s.type === 'EMAIL' ? '📧' : '🔌'} {s.name}
                    </h3>
                    <span style={{
                      fontSize: '0.7rem',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: s.enabled ? 'rgba(0,200,100,0.15)' : 'rgba(200,200,200,0.15)',
                      color: s.enabled ? '#00c864' : '#888',
                    }}>
                      {s.enabled ? 'Aktiv' : 'Inaktiv'}
                    </span>
                    {s.hasCredentials && (
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: 'rgba(100,100,255,0.15)',
                        color: '#8888ff',
                      }}>
                        🔑 Credentials
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {s.url && <span>{s.url} · </span>}
                    {s.username && <span>{s.username} · </span>}
                    {INTERVALS.find((i) => i.value === s.checkIntervalMin)?.label || `${s.checkIntervalMin} min`}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <button
                    className={styles.smallBtn}
                    onClick={() => handleCheck(s.id)}
                    disabled={checking === s.id || checkingAll}
                    title="Kontrollera nu"
                  >
                    {checking === s.id ? '⏳' : '▶️'}
                  </button>
                  <button
                    className={styles.smallBtn}
                    onClick={() => handleToggle(s)}
                    title={s.enabled ? 'Pausa' : 'Aktivera'}
                  >
                    {s.enabled ? '⏸' : '▶'}
                  </button>
                  <button className={styles.smallBtn} onClick={() => handleEdit(s)} title="Redigera">✏️</button>
                  <button className={styles.smallBtn} onClick={() => handleDelete(s.id)} title="Radera">🗑</button>
                </div>
              </div>

              {/* Status row */}
              <div style={{
                display: 'flex',
                gap: '1.5rem',
                marginTop: '0.5rem',
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
              }}>
                <span>Senast kontrollerad: <strong>{timeAgo(s.lastCheckedAt)}</strong></span>
                <span>Uppdrag hittade: <strong>{s.assignmentsFound}</strong></span>
                {s.lastResult && (
                  <span style={{ color: s.lastResult.startsWith('SUCCESS') ? '#00c864' : '#ff6b6b' }}>
                    {s.lastResult.startsWith('SUCCESS') ? '✅' : '❌'} {s.lastResult}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inline animation styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      ` }} />
    </div>
  );
}
