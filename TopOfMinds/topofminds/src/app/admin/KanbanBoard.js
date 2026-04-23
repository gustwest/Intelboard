'use client';

import { useState, useEffect, useCallback } from 'react';
import KanbanCard from './KanbanCard';
import NewIssueModal from './NewIssueModal';
import KanbanIssueModal from './KanbanIssueModal';
import styles from './admin.module.css';

const COLUMNS = [
  { id: 'NY', label: 'Ny', color: '#8b949e', emoji: '🆕' },
  { id: 'PRIORITERAD', label: 'Prioriterad', color: '#d29922', emoji: '⚡' },
  { id: 'PAGAR_UTVECKLING', label: 'Pågår', color: '#58a6ff', emoji: '🔧' },
  { id: 'ANTIGRAVITY_VERIFIERAR', label: 'AG Verifierar', color: '#bc8cff', emoji: '🤖' },
  { id: 'REDO_FOR_VERIFIERING', label: 'Redo', color: '#f0883e', emoji: '👀' },
  { id: 'KLAR', label: 'Klar', color: '#3fb950', emoji: '✅' },
];

export default function KanbanBoard() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const loadIssues = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/kanban');
      if (res.ok) setIssues(await res.json());
    } catch (e) {
      console.error('Failed to load issues:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  const handleDragStart = (e, issueId) => {
    setDraggedId(issueId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', issueId);
  };

  const handleDragOver = (e, colId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(colId);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    setDropTarget(null);
    const issueId = draggedId || e.dataTransfer.getData('text/plain');
    setDraggedId(null);

    if (!issueId) return;

    const issue = issues.find((i) => i.id === issueId);
    if (!issue || issue.status === newStatus) return;

    // Optimistic update
    setIssues((prev) =>
      prev.map((i) => (i.id === issueId ? { ...i, status: newStatus } : i))
    );

    try {
      await fetch(`/api/admin/kanban/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      loadIssues(); // Revert on error
    }
  };

  const handleIssueCreated = (issue) => {
    setIssues((prev) => [...prev, issue]);
    setShowNewModal(false);
  };

  const handleIssueUpdated = () => {
    loadIssues();
    setSelectedIssueId(null);
  };

  if (loading) {
    return (
      <div className={styles.kanbanLoading}>
        <div className={styles.kanbanLoadingSpinner} />
        Laddar ärenden...
      </div>
    );
  }

  return (
    <div>
      <div className={styles.kanbanHeader}>
        <div className={styles.kanbanHeaderInfo}>
          <span className={styles.kanbanTitle}>📋 Ärenden</span>
          <span className={styles.kanbanCount}>{issues.length} ärenden</span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNewModal(true)}>
          ➕ Nytt ärende
        </button>
      </div>

      <div className={styles.kanbanBoard}>
        {COLUMNS.map((col) => {
          const colIssues = issues.filter((i) => i.status === col.id);
          return (
            <div
              key={col.id}
              className={`${styles.kanbanColumn} ${
                dropTarget === col.id ? styles.kanbanColumnDropTarget : ''
              }`}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
            >
              <div className={styles.kanbanColumnHeader}>
                <div className={styles.kanbanColumnTitle}>
                  <span
                    className={styles.kanbanColumnDot}
                    style={{ background: col.color }}
                  />
                  {col.emoji} {col.label}
                </div>
                <span className={styles.kanbanColumnCount}>{colIssues.length}</span>
              </div>
              <div className={styles.kanbanColumnBody}>
                {colIssues.length === 0 && (
                  <div className={styles.kanbanEmptyColumn}>Inga ärenden</div>
                )}
                {colIssues.map((issue) => (
                  <KanbanCard
                    key={issue.id}
                    issue={issue}
                    isDragging={draggedId === issue.id}
                    onDragStart={(e) => handleDragStart(e, issue.id)}
                    onClick={() => setSelectedIssueId(issue.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showNewModal && (
        <NewIssueModal
          onClose={() => setShowNewModal(false)}
          onCreated={handleIssueCreated}
        />
      )}

      {selectedIssueId && (
        <KanbanIssueModal
          issueId={selectedIssueId}
          onClose={() => setSelectedIssueId(null)}
          onUpdated={handleIssueUpdated}
        />
      )}
    </div>
  );
}
