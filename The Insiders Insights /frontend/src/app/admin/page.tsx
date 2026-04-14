'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ============================================================
// TYPES
// ============================================================
interface KanbanIssue {
  id: string;
  title: string;
  description: string;
  status: string;
  order: number;
  images: { url: string; caption?: string }[];
  comments: IssueComment[];
  createdAt: string;
  updatedAt: string;
}

interface IssueComment {
  id: string;
  body: string;
  author: string;
  images: { url: string }[];
  createdAt: string;
}

interface UploadedFile {
  id: string;
  originalName: string;
  displayName: string;
  category: string;
  storedName: string;
  size: number;
  contentType: string;
  uploadedAt: string;
}

const COLUMNS = [
  { key: 'NY', label: 'Ny', emoji: '🆕', color: '#58a6ff' },
  { key: 'PRIORITERAD', label: 'Prioriterad', emoji: '⭐', color: '#f97316' },
  { key: 'PAGAR', label: 'Pågår', emoji: '🔨', color: '#eab308' },
  { key: 'VERIFIERING', label: 'Verifiering', emoji: '🔍', color: '#a855f7' },
  { key: 'KLAR', label: 'Klar', emoji: '🎉', color: '#22c55e' },
] as const;

const FILE_CATEGORIES = [
  'Följardata',
  'Content Analytics',
  'Company Page Analytics',
  'Besöksdata',
  'Competitor Analytics',
  'Annonsering',
  'Sales Navigator',
  'Övrigt',
];

// ============================================================
// MAIN PAGE
// ============================================================
export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'kanban' | 'files'>('kanban');

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a14 0%, #0f0f1e 50%, #0a0a14 100%)',
      color: '#e2e8f0',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Sub-nav: Ärenden / Filer tabs */}
      <div style={{
        padding: '12px 32px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        display: 'flex',
        gap: '4px',
      }}>
        <TabButton active={activeTab === 'kanban'} onClick={() => setActiveTab('kanban')} emoji="📋" label="Ärenden" />
        <TabButton active={activeTab === 'files'} onClick={() => setActiveTab('files')} emoji="📁" label="Filer" />
      </div>

      <main style={{ padding: '24px 32px' }}>
        {activeTab === 'kanban' ? <KanbanTab /> : <FilesTab />}
      </main>
    </div>
  );
}

function TabButton({ active, onClick, emoji, label }: { active: boolean; onClick: () => void; emoji: string; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px',
        borderRadius: '10px',
        border: active ? '1px solid rgba(168,85,247,0.4)' : '1px solid transparent',
        background: active ? 'rgba(168,85,247,0.15)' : 'transparent',
        color: active ? '#a855f7' : 'rgba(255,255,255,0.5)',
        cursor: 'pointer',
        fontSize: '0.8125rem',
        fontWeight: 600,
        transition: 'all 0.2s',
      }}
    >
      {emoji} {label}
    </button>
  );
}


// ============================================================
// KANBAN TAB
// ============================================================
function KanbanTab() {
  const [issues, setIssues] = useState<KanbanIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<KanbanIssue | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchIssues = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/issues`);
      if (res.ok) setIssues(await res.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  const filteredIssues = searchQuery.trim()
    ? issues.filter(i => i.title.toLowerCase().includes(searchQuery.toLowerCase()) || i.description.toLowerCase().includes(searchQuery.toLowerCase()))
    : issues;

  const grouped = COLUMNS.reduce<Record<string, KanbanIssue[]>>((acc, col) => {
    acc[col.key] = filteredIssues.filter(i => i.status === col.key);
    return acc;
  }, {});

  const handleDrop = async (targetColumn: string) => {
    setDropTarget(null);
    if (!draggedId) return;
    const issue = issues.find(i => i.id === draggedId);
    if (!issue || issue.status === targetColumn) { setDraggedId(null); return; }
    setIssues(prev => prev.map(i => i.id === draggedId ? { ...i, status: targetColumn } : i));
    setDraggedId(null);
    try {
      await fetch(`${API_URL}/api/issues/${draggedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetColumn }),
      });
    } catch { fetchIssues(); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(255,255,255,0.4)' }}>Laddar ärenden...</div>;

  return (
    <>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>📋 Ärendehantering</h2>
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '999px' }}>
            {issues.length} ärenden
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="🔍 Sök..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '200px', padding: '8px 14px', fontSize: '0.8125rem',
              background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px', color: '#e2e8f0', outline: 'none',
            }}
          />
          <button onClick={() => setShowNew(true)} style={{
            padding: '8px 18px', background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
            color: 'white', border: 'none', borderRadius: '10px', fontWeight: 600,
            fontSize: '0.8125rem', cursor: 'pointer',
          }}>+ Nytt ärende</button>
        </div>
      </div>

      {/* Board */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${COLUMNS.length}, 1fr)`,
        gap: '12px',
        minHeight: '60vh',
      }}>
        {COLUMNS.map(col => (
          <div
            key={col.key}
            onDragOver={e => { e.preventDefault(); setDropTarget(col.key); }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={e => { e.preventDefault(); handleDrop(col.key); }}
            style={{
              background: dropTarget === col.key ? 'rgba(168,85,247,0.08)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${dropTarget === col.key ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.04)'}`,
              borderRadius: '16px', padding: '12px', transition: 'all 0.2s',
            }}
          >
            {/* Column header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: col.color }} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{col.emoji} {col.label}</span>
              </div>
              <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: '999px' }}>
                {grouped[col.key]?.length || 0}
              </span>
            </div>

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {grouped[col.key]?.map(issue => (
                <div
                  key={issue.id}
                  draggable
                  onDragStart={() => setDraggedId(issue.id)}
                  onDragEnd={() => { setDraggedId(null); setDropTarget(null); }}
                  onClick={() => setSelectedIssue(issue)}
                  style={{
                    background: draggedId === issue.id ? 'rgba(168,85,247,0.1)' : 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '12px', padding: '12px', cursor: 'grab',
                    opacity: draggedId === issue.id ? 0.5 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px', lineHeight: 1.3, color: '#e2e8f0' }}>
                    {issue.title}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.4, marginBottom: '8px' }}>
                    {issue.description.length > 80 ? issue.description.substring(0, 80) + '…' : issue.description}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.625rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.25)' }}>
                      {new Date(issue.createdAt).toLocaleDateString('sv-SE')}
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {issue.images.length > 0 && (
                        <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: 'rgba(255,255,255,0.3)' }}>
                          🖼 {issue.images.length}
                        </span>
                      )}
                      {issue.comments.length > 0 && (
                        <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: 'rgba(255,255,255,0.3)' }}>
                          💬 {issue.comments.length}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {(!grouped[col.key] || grouped[col.key].length === 0) && (
                <div style={{ textAlign: 'center', padding: '20px 12px', color: 'rgba(255,255,255,0.15)', fontSize: '0.75rem' }}>
                  Inga ärenden
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* New Issue Modal */}
      {showNew && <NewIssueModal onClose={() => setShowNew(false)} onCreated={(issue) => { setIssues(prev => [issue, ...prev]); setShowNew(false); }} />}

      {/* Issue Detail Modal */}
      {selectedIssue && (
        <IssueDetailModal
          issue={selectedIssue}
          onClose={() => { setSelectedIssue(null); fetchIssues(); }}
          onDeleted={(id) => { setIssues(prev => prev.filter(i => i.id !== id)); setSelectedIssue(null); }}
        />
      )}
    </>
  );
}


// ============================================================
// NEW ISSUE MODAL
// ============================================================
function NewIssueModal({ onClose, onCreated }: { onClose: () => void; onCreated: (issue: KanbanIssue) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });
      if (res.ok) onCreated(await res.json());
    } catch { /* */ } finally { setIsSubmitting(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#12121c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', width: '460px', maxWidth: '90vw', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.125rem', margin: 0 }}>🆕 Nytt ärende</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.125rem' }}>✕</button>
        </div>
        <input type="text" placeholder="Titel *" value={title} onChange={e => setTitle(e.target.value)} autoFocus
          style={{ width: '100%', padding: '10px 14px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#e2e8f0', fontSize: '0.875rem', marginBottom: '10px', outline: 'none', boxSizing: 'border-box' }}
        />
        <textarea placeholder="Beskrivning *" value={description} onChange={e => setDescription(e.target.value)} rows={5}
          style={{ width: '100%', padding: '10px 14px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#e2e8f0', fontSize: '0.875rem', marginBottom: '16px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', cursor: 'pointer' }}>Avbryt</button>
          <button onClick={handleSubmit} disabled={isSubmitting || !title.trim() || !description.trim()}
            style={{ padding: '8px 18px', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', opacity: isSubmitting || !title.trim() || !description.trim() ? 0.5 : 1 }}>
            {isSubmitting ? 'Skapar...' : '🚀 Skapa ärende'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ============================================================
// ISSUE DETAIL MODAL
// ============================================================
function IssueDetailModal({ issue, onClose, onDeleted }: { issue: KanbanIssue; onClose: () => void; onDeleted: (id: string) => void }) {
  const [currentIssue, setCurrentIssue] = useState(issue);
  const [commentText, setCommentText] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const handleStatusChange = async (newStatus: string) => {
    setCurrentIssue(prev => ({ ...prev, status: newStatus }));
    await fetch(`${API_URL}/api/issues/${issue.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
  };

  const handleComment = async () => {
    if (!commentText.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/issues/${issue.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentText, author: authorName.trim() || 'Team Member' }),
      });
      if (res.ok) {
        const comment = await res.json();
        setCurrentIssue(prev => ({ ...prev, comments: [...prev.comments, comment] }));
        setCommentText('');
        setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch { /* */ } finally { setIsSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Ta bort detta ärende?')) return;
    await fetch(`${API_URL}/api/issues/${issue.id}`, { method: 'DELETE' });
    onDeleted(issue.id);
  };

  const currentCol = COLUMNS.find(c => c.key === currentIssue.status);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#12121c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', width: '680px', maxWidth: '90vw', maxHeight: '85vh', overflow: 'auto', padding: '24px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.125rem', margin: 0, lineHeight: 1.3 }}>{currentIssue.title}</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.125rem', flexShrink: 0 }}>✕</button>
          </div>

          {/* Status + meta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <select value={currentIssue.status} onChange={e => handleStatusChange(e.target.value)}
              style={{ padding: '6px 12px', background: 'rgba(0,0,0,0.3)', border: `1px solid ${currentCol?.color || '#58a6ff'}`, borderRadius: '8px', color: currentCol?.color || '#e2e8f0', fontSize: '0.8125rem', cursor: 'pointer', outline: 'none' }}>
              {COLUMNS.map(col => <option key={col.key} value={col.key}>{col.emoji} {col.label}</option>)}
            </select>
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
              Skapad {new Date(currentIssue.createdAt).toLocaleString('sv-SE')}
            </span>
            <button onClick={handleDelete} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f85149', cursor: 'pointer', fontSize: '0.75rem' }}>🗑 Radera</button>
          </div>

          {/* Description */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>Beskrivning</h3>
            <div style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.7)', whiteSpace: 'pre-wrap' }}>
              {currentIssue.description}
            </div>
          </div>

          {/* Images */}
          {currentIssue.images.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>Bilder</h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {currentIssue.images.map((img, i) => (
                  <div key={i} onClick={() => setLightboxUrl(img.url)} style={{ width: '120px', height: '80px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}>
                    <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <div>
            <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '12px' }}>
              Kommentarer ({currentIssue.comments.length})
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px', maxHeight: '300px', overflowY: 'auto' }}>
              {currentIssue.comments.map(c => (
                <div key={c.id} style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#a855f7' }}>{c.author}</span>
                    <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.25)' }}>{new Date(c.createdAt).toLocaleString('sv-SE')}</span>
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.7)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{c.body}</div>
                </div>
              ))}
              <div ref={commentsEndRef} />
            </div>

            {/* Add comment */}
            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '12px', padding: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
              <input type="text" placeholder="Ditt namn (valfritt)" value={authorName} onChange={e => setAuthorName(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.8125rem', marginBottom: '8px', outline: 'none', boxSizing: 'border-box' }}
              />
              <textarea placeholder="Skriv en kommentar..." value={commentText} onChange={e => setCommentText(e.target.value)} rows={3}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleComment(); } }}
                style={{ width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.8125rem', marginBottom: '8px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.2)' }}>⌘+Enter</span>
                <button onClick={handleComment} disabled={isSubmitting || !commentText.trim()}
                  style={{ padding: '6px 14px', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', opacity: isSubmitting || !commentText.trim() ? 0.5 : 1 }}>
                  {isSubmitting ? 'Skickar...' : 'Kommentera'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, cursor: 'zoom-out' }}>
          <img src={lightboxUrl} alt="Fullstorlek" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px' }} />
        </div>
      )}
    </>
  );
}


// ============================================================
// FILES TAB
// ============================================================
function FilesTab() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileCategory, setFileCategory] = useState('Övrigt');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filterCategory, setFilterCategory] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/files`);
      if (res.ok) setFiles(await res.json());
    } catch { /* */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('name', fileName.trim() || selectedFile.name);
      formData.append('category', fileCategory);

      const res = await fetch(`${API_URL}/api/files`, { method: 'POST', body: formData });
      if (res.ok) {
        const newFile = await res.json();
        setFiles(prev => [newFile, ...prev]);
        setSelectedFile(null);
        setFileName('');
        setFileCategory('Övrigt');
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch { /* */ } finally { setUploading(false); }
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm('Ta bort denna fil?')) return;
    await fetch(`${API_URL}/api/files/${fileId}`, { method: 'DELETE' });
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredFiles = filterCategory ? files.filter(f => f.category === filterCategory) : files;
  const categories = [...new Set(files.map(f => f.category))];

  if (loading) return <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(255,255,255,0.4)' }}>Laddar filer...</div>;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', gap: '24px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 4px' }}>📁 LinkedIn Data-filer</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8125rem', margin: 0 }}>
            Ladda upp CSV/Excel-exporter från LinkedIn. Filer kan laddas ned och köras i AntiGravity.
          </p>
        </div>
      </div>

      {/* Upload zone */}
      <div style={{
        background: 'rgba(168,85,247,0.04)', border: '2px dashed rgba(168,85,247,0.2)',
        borderRadius: '16px', padding: '24px', marginBottom: '24px',
      }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '4px' }}>Fil</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.json,.txt,.pdf"
              onChange={e => setSelectedFile(e.target.files?.[0] || null)}
              style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.8125rem' }}
            />
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '4px' }}>Namn (valfritt)</label>
            <input type="text" placeholder="t.ex. Q1 2025 Content Stats" value={fileName} onChange={e => setFileName(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.8125rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ flex: '0 1 160px' }}>
            <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '4px' }}>Kategori</label>
            <select value={fileCategory} onChange={e => setFileCategory(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.8125rem', cursor: 'pointer', outline: 'none' }}>
              {FILE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <button onClick={handleUpload} disabled={!selectedFile || uploading}
            style={{ padding: '8px 20px', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', opacity: !selectedFile || uploading ? 0.5 : 1, whiteSpace: 'nowrap' }}>
            {uploading ? 'Laddar upp...' : '📤 Ladda upp'}
          </button>
        </div>
      </div>

      {/* Filter */}
      {categories.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <button onClick={() => setFilterCategory('')}
            style={{ padding: '4px 12px', borderRadius: '999px', border: !filterCategory ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(255,255,255,0.06)', background: !filterCategory ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.03)', color: !filterCategory ? '#a855f7' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.75rem' }}>
            Alla ({files.length})
          </button>
          {categories.map(cat => (
            <button key={cat} onClick={() => setFilterCategory(cat)}
              style={{ padding: '4px 12px', borderRadius: '999px', border: filterCategory === cat ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(255,255,255,0.06)', background: filterCategory === cat ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.03)', color: filterCategory === cat ? '#a855f7' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.75rem' }}>
              {cat} ({files.filter(f => f.category === cat).length})
            </button>
          ))}
        </div>
      )}

      {/* File list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filteredFiles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.2)', fontSize: '0.875rem' }}>
            Inga filer uppladdade ännu
          </div>
        ) : (
          filteredFiles.map(f => (
            <div key={f.id} style={{
              display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 16px',
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
              borderRadius: '12px', transition: 'all 0.15s',
            }}>
              <div style={{ fontSize: '1.5rem' }}>
                {f.contentType?.includes('csv') || f.originalName?.endsWith('.csv') ? '📊' :
                 f.contentType?.includes('excel') || f.originalName?.endsWith('.xlsx') ? '📗' :
                 f.contentType?.includes('json') ? '🔧' :
                 f.contentType?.includes('pdf') ? '📄' : '📎'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#e2e8f0' }}>{f.displayName}</div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '2px' }}>
                  <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.3)' }}>{f.originalName}</span>
                  <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.2)' }}>{formatSize(f.size)}</span>
                </div>
              </div>
              <span style={{ padding: '3px 10px', borderRadius: '999px', background: 'rgba(168,85,247,0.1)', color: '#a855f7', fontSize: '0.6875rem', fontWeight: 500 }}>
                {f.category}
              </span>
              <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.2)' }}>
                {new Date(f.uploadedAt).toLocaleDateString('sv-SE')}
              </span>
              <a href={`${API_URL}/api/files/${f.id}/download`} download style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#e2e8f0', textDecoration: 'none', fontSize: '0.75rem', cursor: 'pointer' }}>
                ⬇ Ladda ned
              </a>
              <button onClick={() => handleDelete(f.id)} style={{ background: 'none', border: 'none', color: '#f85149', cursor: 'pointer', fontSize: '0.8125rem' }}>🗑</button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
