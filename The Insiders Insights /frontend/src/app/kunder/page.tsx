'use client';
import { useState, useEffect } from 'react';
import Tooltip from '@/components/Tooltip';
import { Building2, Plus, Database, Layers } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const C = { 
  bg: 'var(--brand-bg)', 
  card: 'var(--brand-panel)', 
  border: 'var(--brand-border)', 
  accent: 'var(--brand-accent)', 
  success: 'var(--brand-success)', 
  warning: 'var(--brand-warning)', 
  danger: 'var(--brand-danger)', 
  text: 'var(--brand-text)', 
  muted: 'var(--brand-muted)', 
  dim: 'var(--brand-dim)' 
};

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
    try {
      const res = await fetch(`${API}/api/customers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, logo_emoji: newEmoji }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => 'Okänt fel');
        alert(`Kunde inte skapa kund: ${err}`);
        return;
      }
      setNewName(''); setShowCreate(false);
      fetchCustomers();
    } catch (e) {
      alert('Nätverksfel — kontrollera att backend körs');
      console.error(e);
    }
  }

  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 32px 60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Building2 size={28} color="var(--brand-accent)" /> 
            Kunder
          </h1>
          <p style={{ fontSize: '0.875rem', color: C.muted, margin: '6px 0 0' }}>
            {customers.length} kunder registrerade i plattformen
          </p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="brand-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={18} /> Ny kund
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="brand-glass-panel" style={{
          padding: '24px', marginBottom: '32px', display: 'flex', gap: '16px', alignItems: 'flex-end',
        }}>
          <div style={{ flex: '0 0 80px' }}>
            <label style={{ fontSize: '0.75rem', color: C.muted, display: 'block', marginBottom: '8px', fontWeight: 600 }}>Emoji</label>
            <input value={newEmoji} onChange={e => setNewEmoji(e.target.value)} style={{
              width: '100%', padding: '12px', borderRadius: '10px', fontSize: '1.5rem', textAlign: 'center',
              background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, color: C.text, outline: 'none',
              transition: 'border 0.2s',
            }} onFocus={e => e.target.style.borderColor = C.accent} onBlur={e => e.target.style.borderColor = C.border} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.75rem', color: C.muted, display: 'block', marginBottom: '8px', fontWeight: 600 }}>Kundnamn</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="T.ex. Malmö stad"
              onKeyDown={e => e.key === 'Enter' && createCustomer()}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: '10px', fontSize: '0.875rem',
                background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, color: C.text, outline: 'none',
                transition: 'border 0.2s',
              }} onFocus={e => e.target.style.borderColor = C.accent} onBlur={e => e.target.style.borderColor = C.border} />
          </div>
          <button onClick={createCustomer} className="brand-btn-primary">
            Skapa kund
          </button>
        </div>
      )}

      {/* Customer grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: C.muted }}>Laddar kunder...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {customers.map((c: any) => (
            <a key={c.id} href={`/kunder/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="brand-glass-panel" style={{
                padding: '24px', cursor: 'pointer', transition: 'all 0.3s ease',
                position: 'relative', overflow: 'hidden',
              }}
              onMouseEnter={e => { 
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(0, 212, 255, 0.4)'; 
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 12px 30px rgba(0,0,0,0.3)';
              }}
              onMouseLeave={e => { 
                (e.currentTarget as HTMLDivElement).style.borderColor = C.border; 
                (e.currentTarget as HTMLDivElement).style.transform = 'none';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
              }}
              >
                {/* Top glow */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, transparent, ${C.accent}, transparent)`, opacity: 0.8 }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ 
                    width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem',
                    border: `1px solid ${C.border}`
                  }}>
                    {c.logo_emoji || '🏢'}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0, color: '#fff' }}>{c.name}</h3>
                    <span style={{ fontSize: '0.75rem', color: C.dim }}>ID: {c.id}</span>
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Database size={16} color={C.accent} />
                    <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{c.dataset_count || 0} dataset</span>
                    <Tooltip content="Mängden uppladdad LinkedIn-data för kunden" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Layers size={16} color={C.success} />
                    <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{c.module_count || 0} moduler</span>
                    <Tooltip content="Aktiva insiktsmoduler för kunden" />
                  </div>
                </div>

                {/* Tags */}
                {c.tags?.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {c.tags.map((t: string) => (
                      <span key={t} style={{
                        padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600,
                        background: 'rgba(0, 212, 255, 0.1)', color: C.accent, border: '1px solid rgba(0, 212, 255, 0.2)',
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
