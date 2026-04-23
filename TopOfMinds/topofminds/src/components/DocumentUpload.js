'use client';

import { useState, useRef } from 'react';

const ACCEPTED_TYPES = '.pdf,.docx,.doc,.xlsx,.xls,.pptx';
const MAX_PREVIEW_CHARS = 8000;

export default function DocumentUpload({ label = 'Importera dokument', pageContext = {} }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [url, setUrl] = useState('');
  const fileRef = useRef(null);

  const dispatch = (text, filename) => {
    const contextHints = [];
    if (pageContext.consultantId) contextHints.push(`(konsult-ID: ${pageContext.consultantId})`);
    if (pageContext.contractId) contextHints.push(`(kontrakt-ID: ${pageContext.contractId})`);

    const preview = text.slice(0, MAX_PREVIEW_CHARS);
    const truncated = text.length > MAX_PREVIEW_CHARS ? `\n\n[...dokumentet fortsätter, ${text.length - MAX_PREVIEW_CHARS} tecken trunkerade]` : '';

    const action = pageContext.consultantId
      ? 'Extrahera all relevant profilinformation (namn, titel, kompetenser, erfarenheter, certifieringar, språk, bio) och uppdatera konsultens profil med update_consultant.'
      : pageContext.contractId
        ? 'Extrahera kontraktsuppgifter (arvode, datum, timmar, parter, status) och uppdatera kontraktet med update_contract. Fråga om något är oklart.'
        : 'Analysera dokumentet och berätta vad du hittar.';

    const message = [
      `Jag har bifogat ett dokument: **${filename}** ${contextHints.join(' ')}`,
      '',
      action,
      '',
      '---',
      preview + truncated,
      '---',
    ].join('\n');

    window.dispatchEvent(new CustomEvent('assistant:open', { detail: { message } }));
  };

  const parseFile = async (file) => {
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/parse/document', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Misslyckades');
      dispatch(data.text, data.filename || file.name);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const parseUrl = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/parse/document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Misslyckades');
      dispatch(data.text, 'Google Dokument');
      setUrl('');
      setShowUrlInput(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          style={{
            padding: '6px 13px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent',
            color: loading ? 'var(--color-text-muted, #94a3b8)' : 'var(--color-text-secondary, #cbd5e1)',
            fontSize: '0.8rem', cursor: loading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          <span style={{ fontSize: '1rem' }}>📎</span>
          {loading ? 'Läser in…' : label}
        </button>
        <button
          onClick={() => setShowUrlInput((v) => !v)}
          disabled={loading}
          style={{
            padding: '6px 13px', borderRadius: 8,
            border: `1px solid ${showUrlInput ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.12)'}`,
            background: showUrlInput ? 'rgba(99,102,241,0.12)' : 'transparent',
            color: showUrlInput ? '#a5b4fc' : 'var(--color-text-muted, #94a3b8)',
            fontSize: '0.8rem', cursor: 'pointer',
          }}
        >
          Google Docs
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_TYPES}
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files?.[0]) parseFile(e.target.files[0]); e.target.value = ''; }}
        />
      </div>

      {showUrlInput && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.google.com/document/d/..."
            style={{
              flex: 1, padding: '7px 12px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--color-text-primary, #f1f5f9)',
              fontSize: '0.82rem', outline: 'none', fontFamily: 'inherit',
            }}
            onKeyDown={(e) => e.key === 'Enter' && parseUrl()}
          />
          <button
            onClick={parseUrl}
            disabled={!url.trim() || loading}
            style={{
              padding: '7px 14px', borderRadius: 8, border: 'none',
              background: url.trim() && !loading
                ? 'linear-gradient(135deg, hsl(220,70%,50%), hsl(260,60%,50%))'
                : 'rgba(255,255,255,0.1)',
              color: '#fff', fontSize: '0.82rem',
              cursor: url.trim() && !loading ? 'pointer' : 'default',
            }}
          >
            Importera
          </button>
        </div>
      )}

      {error && (
        <div style={{ fontSize: '0.78rem', color: '#f87171' }}>
          {error}
        </div>
      )}
    </div>
  );
}
