'use client';

import { useState, useCallback, useEffect } from 'react';
import styles from './page.module.css';
import KanbanCard from './KanbanCard';
import NewIssueModal from './NewIssueModal';
import KanbanIssueModal from './KanbanIssueModal';

export interface KanbanIssueData {
  id: string;
  title: string;
  description: string;
  status: string;
  order: number;
  creatorId: string;
  createdAt: string;
  updatedAt: string;
  creator: { id: string; name: string; image: string | null };
  images: { id: string; url: string }[];
  _count: { comments: number; agentTasks?: number };
  agentTasks?: { id: string; status: string }[];
  latestComment: {
    authorName: string;
    createdAt: string;
    body: string;
  } | null;
}

const COLUMNS = [
  { key: 'NY', label: 'Ny', emoji: '🆕', color: '#58a6ff' },
  { key: 'PRIORITERAD', label: 'Prioriterad - Att göra', emoji: '⭐', color: '#f97316' },
  { key: 'PAGAR_UTVECKLING', label: 'Pågår utveckling', emoji: '🔨', color: '#eab308' },
  { key: 'ANTIGRAVITY_VERIFIERAR', label: 'AntiGravity verifierar', emoji: '🔍', color: '#a855f7' },
  { key: 'REDO_FOR_VERIFIERING', label: 'Redo för verifiering', emoji: '✅', color: '#06b6d4' },
  { key: 'KLAR', label: 'Klar', emoji: '🎉', color: '#22c55e' },
] as const;

export { COLUMNS };

export default function KanbanBoard() {
  const [issues, setIssues] = useState<KanbanIssueData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewIssue, setShowNewIssue] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Fetch all issues
  const fetchIssues = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/kanban');
      if (res.ok) {
        const data = await res.json();
        setIssues(data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  // Filter issues by search query
  const filteredIssues = searchQuery.trim()
    ? issues.filter((i) => {
        const q = searchQuery.toLowerCase();
        return i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q);
      })
    : issues;

  // Group issues by status
  const grouped = COLUMNS.reduce<Record<string, KanbanIssueData[]>>((acc, col) => {
    acc[col.key] = filteredIssues
      .filter((i) => i.status === col.key)
      .sort((a, b) => a.order - b.order);
    return acc;
  }, {});

  // Drag handlers
  const handleDragStart = (issueId: string) => {
    setDraggedId(issueId);
  };

  const handleDragOver = (e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(columnKey);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = async (e: React.DragEvent, targetColumn: string) => {
    e.preventDefault();
    setDropTarget(null);

    if (!draggedId) return;

    const issue = issues.find((i) => i.id === draggedId);
    if (!issue || issue.status === targetColumn) {
      setDraggedId(null);
      return;
    }

    // Optimistic update
    setIssues((prev) =>
      prev.map((i) => (i.id === draggedId ? { ...i, status: targetColumn } : i))
    );
    setDraggedId(null);

    // API call
    try {
      const res = await fetch(`/api/admin/kanban/${draggedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetColumn }),
      });
      if (!res.ok) {
        // Revert on failure
        fetchIssues();
      }
    } catch {
      fetchIssues();
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDropTarget(null);
  };

  // After creating a new issue
  const handleIssueCreated = (issue: KanbanIssueData) => {
    setIssues((prev) => [issue, ...prev]);
    setShowNewIssue(false);
  };

  // After updating an issue in the modal
  const handleIssueUpdated = (keepOpen?: boolean) => {
    fetchIssues();
    if (!keepOpen) {
      setSelectedIssueId(null);
    }
  };

  const handleIssueDeleted = (id: string) => {
    setIssues((prev) => prev.filter((i) => i.id !== id));
    setSelectedIssueId(null);
  };

  if (loading) {
    return (
      <div className={styles.kanbanLoading}>
        <div className={styles.kanbanLoadingSpinner} />
        <span>Laddar ärenden...</span>
      </div>
    );
  }

  return (
    <>
      <div className={styles.kanbanHeader}>
        <div className={styles.kanbanHeaderInfo}>
          <h2 className={styles.kanbanTitle}>📋 Ärendehantering</h2>
          <span className={styles.kanbanCount}>{issues.length} ärenden</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              className="input"
              placeholder="🔍 Sök ärenden..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '220px', fontSize: '0.8125rem',
                padding: '6px 12px', borderRadius: '8px',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-tertiary)', fontSize: '0.875rem',
                }}
              >
                ✕
              </button>
            )}
          </div>
          <button className="btn btn-primary" onClick={() => setShowNewIssue(true)}>
            + Nytt ärende
          </button>
        </div>
      </div>

      <div className={styles.kanbanBoard}>
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            className={`${styles.kanbanColumn} ${dropTarget === col.key ? styles.kanbanColumnDropTarget : ''}`}
            onDragOver={(e) => handleDragOver(e, col.key)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.key)}
          >
            <div className={styles.kanbanColumnHeader}>
              <div className={styles.kanbanColumnTitle}>
                <span
                  className={styles.kanbanColumnDot}
                  style={{ background: col.color }}
                />
                <span>{col.emoji} {col.label}</span>
              </div>
              <span className={styles.kanbanColumnCount}>
                {grouped[col.key]?.length || 0}
              </span>
            </div>

            <div className={styles.kanbanColumnBody}>
              {grouped[col.key]?.map((issue) => (
                <KanbanCard
                  key={issue.id}
                  issue={issue}
                  isDragging={draggedId === issue.id}
                  onDragStart={() => handleDragStart(issue.id)}
                  onDragEnd={handleDragEnd}
                  onClick={() => setSelectedIssueId(issue.id)}
                />
              ))}
              {(!grouped[col.key] || grouped[col.key].length === 0) && (
                <div className={styles.kanbanEmptyColumn}>
                  Inga ärenden
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showNewIssue && (
        <NewIssueModal
          onClose={() => setShowNewIssue(false)}
          onCreated={handleIssueCreated}
        />
      )}

      {selectedIssueId && (
        <KanbanIssueModal
          issueId={selectedIssueId}
          onClose={() => setSelectedIssueId(null)}
          onUpdated={handleIssueUpdated}
          onDeleted={handleIssueDeleted}
        />
      )}
    </>
  );
}
