'use client';

import styles from './page.module.css';
import type { KanbanIssueData } from './KanbanBoard';
import { formatTimestamp } from '@/lib/formatTimestamp';

interface Props {
  issue: KanbanIssueData;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
}

export default function KanbanCard({ issue, isDragging, onDragStart, onDragEnd, onClick }: Props) {


  const isRecent = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    return diff < 24 * 60 * 60 * 1000; // 24 hours
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  return (
    <div
      className={`${styles.kanbanCard} ${isDragging ? styles.kanbanCardDragging : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', issue.id);
        // Slight delay for drag ghost to render
        requestAnimationFrame(() => onDragStart());
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      <div className={styles.kanbanCardTitle}>
        {issue.agentTasks && issue.agentTasks.length > 0 && (
          <span title="Agent jobbar..." style={{
            display: 'inline-block', marginRight: '4px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}>🤖</span>
        )}
        {issue.title}
      </div>
      <div className={styles.kanbanCardDesc}>
        {issue.description.length > 100
          ? issue.description.substring(0, 100) + '…'
          : issue.description}
      </div>

      <div className={styles.kanbanCardFooter}>
        <div className={styles.kanbanCardMeta}>
          <div className={styles.kanbanCardAvatar}>
            {issue.creator.image ? (
              <img src={issue.creator.image} alt={issue.creator.name} />
            ) : (
              getInitials(issue.creator.name)
            )}
          </div>
          <span className={styles.kanbanCardTime}>{formatTimestamp(issue.createdAt)}</span>
        </div>
        <div className={styles.kanbanCardBadges}>
          {issue.images.length > 0 && (
            <span className={styles.kanbanCardBadge}>🖼 {issue.images.length}</span>
          )}
          {issue._count.comments > 0 && (
            <span className={`${styles.kanbanCardBadge} ${
              issue.latestComment && isRecent(issue.latestComment.createdAt) ? styles.kanbanCardBadgeNew : ''
            }`}>
              💬 {issue._count.comments}
              {issue.latestComment && isRecent(issue.latestComment.createdAt) && (
                <span className={styles.kanbanNewDot} />
              )}
            </span>
          )}
        </div>
      </div>
      {issue.latestComment && isRecent(issue.latestComment.createdAt) && (
        <div className={styles.kanbanCardLatestComment}>
          <strong>{issue.latestComment.authorName.split(' ')[0]}</strong>: {issue.latestComment.body.substring(0, 50)}
          {issue.latestComment.body.length > 50 ? '…' : ''}
        </div>
      )}
    </div>
  );
}
