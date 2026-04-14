'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { searchAll, SearchResult } from '@/lib/search';
import styles from './search.module.css';

function SearchContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (q) {
      setResults(searchAll(q));
    }
  }, [q]);

  return (
    <div className="content-wrapper">
      <div className={styles.header}>
        <h1 className={styles.title}>Search Results</h1>
        {q && <p className={styles.query}>Showing results for &quot;{q}&quot;</p>}
      </div>

      {results.length > 0 ? (
        <div className={styles.resultsList}>
          {results.map(result => (
            <Link
              key={result.id}
              href={`/category/${result.slug}`}
              className={`${styles.resultCard} glass-card`}
            >
              <span className={styles.resultIcon}>{result.icon}</span>
              <div className={styles.resultInfo}>
                <h3 className={styles.resultTitle}>{result.title}</h3>
                <p className={styles.resultDesc}>{result.description}</p>
                <span className="badge">{result.type}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : q ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">No results found</div>
          <div className="empty-state-desc">Try searching with different keywords</div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">Start Searching</div>
          <div className="empty-state-desc">Use the search bar to find categories, discussions, and more</div>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="content-wrapper"><div className="skeleton" style={{ height: '200px' }}></div></div>}>
      <SearchContent />
    </Suspense>
  );
}
