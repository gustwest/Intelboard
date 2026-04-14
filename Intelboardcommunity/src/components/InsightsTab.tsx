'use client';

import React, { useState, useEffect } from 'react';
import { getNotes, getExperts, getNotesScored } from '@/lib/communityStore';
import { getStoredWikiContent } from '@/lib/wikiStorage';
import { findCategoryBySlug } from '@/data/categories';
import styles from './InsightsTab.module.css';

interface InsightData {
  threadsCount: number;
  eventsCount: number;
  notesCount: number;
  expertsCount: number;
  learnersCount: number;
  hasWikiContent: boolean;
  topNotes: { body: string; tag: string; score: number; authorName: string }[];
  topContributors: { name: string; contributions: number }[];
  subcategoryCoverage: { name: string; slug: string; hasFetched: boolean }[];
}

export default function InsightsTab({ categoryId, categoryName }: { categoryId: string; categoryName: string }) {
  const [data, setData] = useState<InsightData | null>(null);

  useEffect(() => {
    const notes = getNotesScored(categoryId);
    const experts = getExperts(categoryId);
    const wikiContent = getStoredWikiContent(categoryId);
    const category = findCategoryBySlug(categoryId);

    // Count unique contributors
    const contributorMap: Record<string, number> = {};
    notes.forEach(n => {
      contributorMap[n.authorName] = (contributorMap[n.authorName] || 0) + 1;
    });
    const topContributors = Object.entries(contributorMap)
      .map(([name, contributions]) => ({ name, contributions }))
      .sort((a, b) => b.contributions - a.contributions)
      .slice(0, 5);

    // Subcategory coverage
    const subcategoryCoverage = (category?.children || []).map(child => ({
      name: child.name,
      slug: child.slug,
      hasFetched: getStoredWikiContent(child.slug) !== null,
    }));

    setData({
      threadsCount: 1, // Starter thread always exists
      eventsCount: 2,  // Starter events
      notesCount: notes.length,
      expertsCount: experts.filter(e => e.role === 'expert').length,
      learnersCount: experts.filter(e => e.role === 'learner').length,
      hasWikiContent: wikiContent !== null,
      topNotes: notes.slice(0, 3).map(n => ({ body: n.body, tag: n.tag, score: n.score, authorName: n.authorName })),
      topContributors,
      subcategoryCoverage,
    });
  }, [categoryId]);

  if (!data) return null;

  const coveragePct = data.subcategoryCoverage.length > 0
    ? Math.round((data.subcategoryCoverage.filter(s => s.hasFetched).length / data.subcategoryCoverage.length) * 100)
    : 0;

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>📊 Category Insights</h2>
      <p className={styles.subtitle}>Activity overview and trends for {categoryName}</p>

      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        {[
          { label: 'Wiki Content', value: data.hasWikiContent ? '✅' : '❌', desc: data.hasWikiContent ? 'Loaded' : 'Not fetched' },
          { label: 'Notes', value: data.notesCount.toString(), desc: 'Community notes' },
          { label: 'Experts', value: data.expertsCount.toString(), desc: 'Registered' },
          { label: 'Learners', value: data.learnersCount.toString(), desc: 'Learning' },
          { label: 'Threads', value: data.threadsCount.toString(), desc: 'Forum threads' },
          { label: 'Events', value: data.eventsCount.toString(), desc: 'Scheduled' },
        ].map((s, i) => (
          <div key={i} className={styles.statBox}>
            <span className={styles.statValue}>{s.value}</span>
            <span className={styles.statLabel}>{s.label}</span>
            <span className={styles.statDesc}>{s.desc}</span>
          </div>
        ))}
      </div>

      {/* Subcategory Coverage */}
      {data.subcategoryCoverage.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>📂 Subcategory Coverage</h3>
            <span className={styles.coveragePct}>{coveragePct}% covered</span>
          </div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${Math.max(coveragePct, 2)}%` }} />
          </div>
          <div className={styles.coverageGrid}>
            {data.subcategoryCoverage.map(sc => (
              <div key={sc.slug} className={`${styles.coverageItem} ${sc.hasFetched ? styles.covered : styles.uncovered}`}>
                <span>{sc.hasFetched ? '✅' : '⬜'}</span>
                <span>{sc.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top Contributors */}
      {data.topContributors.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>🏆 Top Contributors</h3>
          <div className={styles.contributorList}>
            {data.topContributors.map((c, i) => (
              <div key={c.name} className={styles.contributorRow}>
                <span className={styles.rank}>{['🥇', '🥈', '🥉', '4', '5'][i]}</span>
                <span className={styles.contributorName}>{c.name}</span>
                <span className={styles.contributorCount}>{c.contributions} contribution{c.contributions > 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top Notes */}
      {data.topNotes.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>🔥 Top Rated Notes</h3>
          <div className={styles.topNotes}>
            {data.topNotes.map((n, i) => (
              <div key={i} className={styles.topNote}>
                <span className={styles.noteScore}>▲ {n.score}</span>
                <div className={styles.noteInfo}>
                  <p className={styles.notePreview}>{n.body.slice(0, 120)}{n.body.length > 120 ? '...' : ''}</p>
                  <span className={styles.noteAuthor}>by {n.authorName}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
