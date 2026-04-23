'use client';

import styles from './admin.module.css';

function timeAgo(date) {
  const d = new Date(date);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'Just nu';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

export default function KanbanCard({ issue, isDragging, onDragStart, onClick }) {
  const initials = (issue.creatorName || 'A')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const hasAgent = issue.agentTasks?.length > 0;
  const agentRunning = issue.agentTasks?.some((t) => t.status === 'RUNNING' || t.status === 'PENDING');

  return (
    <div
      className={`${styles.kanbanCard} ${isDragging ? styles.kanbanCardDragging : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={() => {}} // Clear ghost
      onClick={onClick}
    >
      <div className={styles.kanbanCardTitle}>{issue.title}</div>
      <div className={styles.kanbanCardDesc}>
        {issue.description?.slice(0, 100)}
        {issue.description?.length > 100 ? '...' : ''}
      </div>

      <div className={styles.kanbanCardFooter}>
        <div className={styles.kanbanCardMeta}>
          <div className={styles.kanbanCardAvatar}>{initials}</div>
          <span className={styles.kanbanCardTime}>{timeAgo(issue.updatedAt || issue.createdAt)}</span>
        </div>

        <div className={styles.kanbanCardBadges}>
          {(issue._count?.comments > 0) && (
            <span className={styles.kanbanCardBadge}>
              💬 {issue._count.comments}
            </span>
          )}
          {issue.images?.length > 0 && (
            <span className={styles.kanbanCardBadge}>📎 {issue.images.length}</span>
          )}
          {hasAgent && (
            <span className={`${styles.kanbanCardBadge} ${agentRunning ? styles.kanbanCardBadgeNew : ''}`}>
              {agentRunning && <span className={styles.kanbanNewDot} />}
              🤖
            </span>
          )}
        </div>
      </div>

      {issue.latestComment && (
        <div className={styles.kanbanCardLatestComment}>
          <strong>{issue.latestComment.authorName}</strong>:{' '}
          {issue.latestComment.body}
        </div>
      )}
    </div>
  );
}
