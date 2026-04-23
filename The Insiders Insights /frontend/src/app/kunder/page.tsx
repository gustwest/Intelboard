'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const C = { bg:'#0a0a0f', card:'#12121a', border:'rgba(255,255,255,0.06)', accent:'#a855f7', success:'#22c55e', warning:'#f59e0b', danger:'#ef4444', text:'#f8fafc', muted:'rgba(255,255,255,0.45)', dim:'rgba(255,255,255,0.25)' };

export default function KunderPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('🏢');

  useEffect(() => { fetchCustomers(); }, []);

  async function fetchCustomers() {
    try {
      const res = await fetch(`${API}/api/customers`);
      setCustomers(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function createCustomer() {
    if (!newName.trim()) return;
    await fetch(`${API}/api/customers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, logo_emoji: newEmoji }),
    });
    setNewName(''); setShowCreate(false);
    fetchCustomers();
  }

  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 24px 60px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>🏢 Kunder</h1>
          <p style={{ fontSize: '0.8125rem', color: C.muted, margin: '4px 0 0' }}>
            {customers.length} kunder registrerade
          </p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} style={{
          padding: '10px 20px', borderRadius: '12px', fontSize: '0.875rem', fontWeight: 700,
          background: 'linear-gradient(135deg, #a855f7, #6366f1)', color: '#fff',
          border: 'none', cursor: 'pointer',
        }}>
          + Ny kund
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: '16px',
          padding: '24px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'flex-end',
        }}>
          <div style={{ flex: '0 0 80px' }}>
            <label style={{ fontSize: '0.75rem', color: C.muted, display: 'block', marginBottom: '6px' }}>Emoji</label>
            <input value={newEmoji} onChange={e => setNewEmoji(e.target.value)} style={{
              width: '100%', padding: '10px', borderRadius: '10px', fontSize: '1.5rem', textAlign: 'center',
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text,
            }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.75rem', color: C.muted, display: 'block', marginBottom: '6px' }}>Kundnamn</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="T.ex. Malmö stad"
              onKeyDown={e => e.key === 'Enter' && createCustomer()}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '10px', fontSize: '0.875rem',
                background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text,
              }} />
          </div>
          <button onClick={createCustomer} style={{
            padding: '10px 24px', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 700,
            background: C.accent, color: '#fff', border: 'none', cursor: 'pointer',
          }}>
            Skapa
          </button>
        </div>
      )}

      {/* Customer grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted }}>Laddar kunder...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {customers.map((c: any) => (
            <a key={c.id} href={`/kunder/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: '16px',
                padding: '24px', cursor: 'pointer', transition: 'all 0.2s',
                position: 'relative', overflow: 'hidden',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(168,85,247,0.3)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.border; (e.currentTarget as HTMLDivElement).style.transform = 'none'; }}
              >
                {/* Top glow */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, transparent, ${C.accent}40, transparent)` }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '2rem' }}>{c.logo_emoji || '🏢'}</span>
                  <div>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>{c.name}</h3>
                    <span style={{ fontSize: '0.75rem', color: C.dim }}>ID: {c.id}</span>
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.75rem', color: C.muted }}>📁</span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{c.file_count || 0} filer</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.75rem', color: C.muted }}>🎯</span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{c.active_modules?.length || 0} moduler</span>
                  </div>
                </div>

                {/* Tags */}
                {c.tags?.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {c.tags.map((t: string) => (
                      <span key={t} style={{
                        padding: '2px 10px', borderRadius: '20px', fontSize: '0.6875rem', fontWeight: 600,
                        background: 'rgba(168,85,247,0.1)', color: C.accent, border: '1px solid rgba(168,85,247,0.2)',
                      }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
