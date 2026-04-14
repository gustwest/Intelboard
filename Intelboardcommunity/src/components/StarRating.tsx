'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { setRating, getAggregatedRating, AggregatedRating } from '@/lib/userStore';
import styles from './StarRating.module.css';

interface StarRatingProps {
  targetType: string;
  targetId: string;
  size?: 'sm' | 'md';
  showCount?: boolean;
}

export default function StarRating({ targetType, targetId, size = 'md', showCount = true }: StarRatingProps) {
  const { user } = useAuth();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [aggData, setAggData] = useState<AggregatedRating>(() =>
    getAggregatedRating(user?.uid || null, targetType, targetId)
  );

  // Refresh on user change
  React.useEffect(() => {
    setAggData(getAggregatedRating(user?.uid || null, targetType, targetId));
  }, [user?.uid, targetType, targetId]);

  function handleClick(starIndex: number) {
    if (!user) return;
    const newRating = starIndex + 1;
    setRating(user.uid, targetType, targetId, newRating);
    setAggData(getAggregatedRating(user.uid, targetType, targetId));
  }

  const displayRating = hoverIndex !== null ? hoverIndex + 1 : (aggData.userRating || 0);

  return (
    <div className={`${styles.container} ${styles[size]}`}>
      <div
        className={styles.stars}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {[0, 1, 2, 3, 4].map(i => (
          <button
            key={i}
            className={`${styles.star} ${i < displayRating ? styles.filled : ''} ${!user ? styles.disabled : ''}`}
            onMouseEnter={() => user && setHoverIndex(i)}
            onClick={() => handleClick(i)}
            disabled={!user}
            aria-label={`Rate ${i + 1} star${i > 0 ? 's' : ''}`}
            title={user ? `Rate ${i + 1} star${i > 0 ? 's' : ''}` : 'Sign in to rate'}
          >
            ★
          </button>
        ))}
      </div>
      {showCount && (
        <span className={styles.meta}>
          {aggData.count > 0 ? (
            <>
              <span className={styles.average}>{aggData.average.toFixed(1)}</span>
              <span className={styles.count}>({aggData.count})</span>
            </>
          ) : (
            <span className={styles.noRatings}>No ratings</span>
          )}
        </span>
      )}
    </div>
  );
}
