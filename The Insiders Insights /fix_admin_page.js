const fs = require('fs');

let content = fs.readFileSync('frontend/src/app/admin/page.tsx', 'utf8');

content = content.replace(
`import { useState, useCallback, useEffect, useRef } from 'react';`,
`import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  ClipboardList, Folder, Bot, Search, Plus, X, Image as ImageIcon, 
  MessageSquare, Download, Trash2, CheckCircle2, CircleDashed, 
  ArrowUpCircle, PlayCircle, Loader2, Send, Upload, Info
} from 'lucide-react';`
);

content = content.replace(
`const COLUMNS = [
  { key: 'NY', label: 'Ny', emoji: '🆕', color: '#58a6ff' },
  { key: 'PRIORITERAD', label: 'Prioriterad', emoji: '⭐', color: '#f97316' },
  { key: 'PAGAR', label: 'Pågår', emoji: '🔨', color: '#eab308' },
  { key: 'VERIFIERING', label: 'Verifiering', emoji: '🔍', color: 'var(--brand-accent)' },
  { key: 'KLAR', label: 'Klar', emoji: '🎉', color: '#22c55e' },
] as const;`,
`const COLUMNS = [
  { key: 'NY', label: 'Ny', icon: CircleDashed, color: '#58a6ff' },
  { key: 'PRIORITERAD', label: 'Prioriterad', icon: ArrowUpCircle, color: '#f97316' },
  { key: 'PAGAR', label: 'Pågår', icon: PlayCircle, color: '#eab308' },
  { key: 'VERIFIERING', label: 'Verifiering', icon: Search, color: 'var(--brand-accent)' },
  { key: 'KLAR', label: 'Klar', icon: CheckCircle2, color: '#22c55e' },
] as const;`
);

content = content.replace(
`<TabButton active={activeTab === 'kanban'} onClick={() => setActiveTab('kanban')} emoji="📋" label="Ärenden" />
        <TabButton active={activeTab === 'files'} onClick={() => setActiveTab('files')} emoji="📁" label="Filer" />
        <TabButton active={activeTab === 'agent'} onClick={() => setActiveTab('agent')} emoji="🤖" label="AI Agent" />`,
`<TabButton active={activeTab === 'kanban'} onClick={() => setActiveTab('kanban')} icon={ClipboardList} label="Ärenden" />
        <TabButton active={activeTab === 'files'} onClick={() => setActiveTab('files')} icon={Folder} label="Filer" />
        <TabButton active={activeTab === 'agent'} onClick={() => setActiveTab('agent')} icon={Bot} label="AI Agent" />`
);

content = content.replace(
`function TabButton({ active, onClick, emoji, label }: { active: boolean; onClick: () => void; emoji: string; label: string }) {`,
`function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {`
);

content = content.replace(
`{emoji} {label}`,
`<Icon size={16} /> {label}`
);

content = content.replace(
`<h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>📋 Ärendehantering</h2>`,
`<h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><ClipboardList size={20} className="brand-text-accent" /> Ärendehantering</h2>`
);

content = content.replace(
`<button onClick={() => setShowNew(true)} style={{
            padding: '8px 18px', background: 'linear-gradient(135deg, var(--brand-accent), var(--brand-accent-hover))',
            color: 'white', border: 'none', borderRadius: '10px', fontWeight: 600,
            fontSize: '0.8125rem', cursor: 'pointer',
          }}>+ Nytt ärende</button>`,
`<button onClick={() => setShowNew(true)} className="brand-btn-primary" style={{ padding: '8px 18px', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} /> Nytt ärende
          </button>`
);

content = content.replace(
`{col.emoji} {col.label}`,
`<col.icon size={14} /> {col.label}`
);

content = content.replace(
`🖼 {issue.images.length}`,
`<ImageIcon size={12} /> {issue.images.length}`
);

content = content.replace(
`💬 {issue.comments.length}`,
`<MessageSquare size={12} /> {issue.comments.length}`
);

content = content.replace(
`<h2 style={{ fontSize: '1.125rem', margin: 0 }}>🆕 Nytt ärende</h2>`,
`<h2 style={{ fontSize: '1.125rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Plus size={20} className="brand-text-accent"/> Nytt ärende</h2>`
);

content = content.replace(
`<button onClick={handleSubmit} disabled={isSubmitting || !title.trim() || !description.trim()}
            style={{ padding: '8px 18px', background: 'linear-gradient(135deg, var(--brand-accent), var(--brand-accent-hover))', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', opacity: isSubmitting || !title.trim() || !description.trim() ? 0.5 : 1 }}>
            {isSubmitting ? 'Skapar...' : '🚀 Skapa ärende'}
          </button>`,
`<button onClick={handleSubmit} disabled={isSubmitting || !title.trim() || !description.trim()} className="brand-btn-primary" style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: '6px', opacity: isSubmitting || !title.trim() || !description.trim() ? 0.5 : 1 }}>
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {isSubmitting ? 'Skapar...' : 'Skapa ärende'}
          </button>`
);

content = content.replace(
`{COLUMNS.map(col => <option key={col.key} value={col.key}>{col.emoji} {col.label}</option>)}`,
`{COLUMNS.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}`
);

content = content.replace(
`<button onClick={handleDelete} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f85149', cursor: 'pointer', fontSize: '0.75rem' }}>🗑 Radera</button>`,
`<button onClick={handleDelete} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f85149', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Trash2 size={14} /> Radera</button>`
);

content = content.replace(
`<button onClick={handleComment} disabled={isSubmitting || !commentText.trim()}
                  style={{ padding: '6px 14px', background: 'linear-gradient(135deg, var(--brand-accent), var(--brand-accent-hover))', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', opacity: isSubmitting || !commentText.trim() ? 0.5 : 1 }}>
                  {isSubmitting ? 'Skickar...' : 'Kommentera'}
                </button>`,
`<button onClick={handleComment} disabled={isSubmitting || !commentText.trim()} className="brand-btn-primary" style={{ padding: '6px 14px', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '6px', opacity: isSubmitting || !commentText.trim() ? 0.5 : 1 }}>
                  {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {isSubmitting ? 'Skickar...' : 'Kommentera'}
                </button>`
);

content = content.replace(
`<h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 4px' }}>📁 LinkedIn Data-filer</h2>`,
`<h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}><Folder size={20} className="brand-text-accent" /> LinkedIn Data-filer</h2>`
);

content = content.replace(
`<button onClick={handleUpload} disabled={!selectedFile || uploading}
            style={{ padding: '8px 20px', background: 'linear-gradient(135deg, var(--brand-accent), var(--brand-accent-hover))', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', opacity: !selectedFile || uploading ? 0.5 : 1, whiteSpace: 'nowrap' }}>
            {uploading ? 'Laddar upp...' : '📤 Ladda upp'}
          </button>`,
`<button onClick={handleUpload} disabled={!selectedFile || uploading} className="brand-btn-primary" style={{ padding: '8px 20px', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '6px', opacity: !selectedFile || uploading ? 0.5 : 1, whiteSpace: 'nowrap' }}>
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} {uploading ? 'Laddar upp...' : 'Ladda upp'}
          </button>`
);

content = content.replace(
`⬇ Ladda ned`,
`<Download size={14} style={{ marginRight: '4px', display: 'inline-block', verticalAlign: 'middle' }} /> Ladda ned`
);

content = content.replace(
`<button onClick={() => handleDelete(f.id)} style={{ background: 'none', border: 'none', color: '#f85149', cursor: 'pointer', fontSize: '0.8125rem' }}>🗑</button>`,
`<button onClick={() => handleDelete(f.id)} style={{ background: 'none', border: 'none', color: '#f85149', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={16} /></button>`
);

content = content.replace(
`➕ Ny session`,
`<Plus size={16} /> Ny session`
);

content = content.replace(
`<span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span>`,
`<Loader2 size={14} className="animate-spin" />`
);

content = content.replace(
`⏳ Väntar på agent...`,
`<CircleDashed size={14} className="animate-spin" style={{ marginRight: '6px', display: 'inline-block', verticalAlign: 'middle' }} /> Väntar på agent...`
);

content = content.replace(
`❌ {task.error}`,
`<X size={14} style={{ marginRight: '6px', display: 'inline-block', verticalAlign: 'middle' }} /> {task.error}`
);

content = content.replace(
`📋 {task.logs.length} loggar`,
`<Info size={12} style={{ marginRight: '4px', display: 'inline-block', verticalAlign: 'middle' }} /> {task.logs.length} loggar`
);

content = content.replace(
`<span style={{ fontSize: '3rem' }}>🤖</span>`,
`<Bot size={48} className="brand-text-accent" />`
);

content = content.replace(
`{sending ? '⏳' : '🚀'} Skicka`,
`{sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Skicka`
);

fs.writeFileSync('frontend/src/app/admin/page.tsx', content);
