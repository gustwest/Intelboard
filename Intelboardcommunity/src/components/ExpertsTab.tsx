'use client';

import React, { useState, useEffect } from 'react';
import { useAuth, DEMO_USERS, getDemoAvatar } from '@/contexts/AuthContext';
import { getExperts, setExpertProfile, removeExpertProfile, getUserExpertProfile, ExpertProfile } from '@/lib/communityStore';
import { getAggregatedRating } from '@/lib/userStore';
import styles from './ExpertsTab.module.css';

export default function ExpertsTab({ categoryId, categoryName }: { categoryId: string; categoryName: string }) {
  const { user, signInAsDemo } = useAuth();
  const [experts, setExperts] = useState<ExpertProfile[]>([]);
  const [myProfile, setMyProfile] = useState<ExpertProfile | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [role, setRole] = useState<'expert' | 'learner'>('learner');
  const [bio, setBio] = useState('');
  const [mentorship, setMentorship] = useState<'available' | 'seeking' | 'none'>('none');

  useEffect(() => {
    refreshData();
  }, [categoryId, user?.uid]);

  function refreshData() {
    setExperts(getExperts(categoryId));
    if (user) {
      const profile = getUserExpertProfile(categoryId, user.uid);
      setMyProfile(profile);
      if (profile) {
        setRole(profile.role);
        setBio(profile.bio);
        setMentorship(profile.mentorshipStatus);
      }
    }
  }

  function handleSave() {
    if (!user) return;
    const profile: ExpertProfile = {
      uid: user.uid,
      displayName: user.displayName || 'Anonymous',
      categoryId,
      role,
      bio: bio.trim(),
      joinedAt: myProfile?.joinedAt || new Date().toISOString(),
      mentorshipStatus: mentorship,
    };
    setExpertProfile(categoryId, profile);
    setShowForm(false);
    refreshData();
  }

  function handleLeave() {
    if (!user) return;
    removeExpertProfile(categoryId, user.uid);
    setMyProfile(null);
    setShowForm(false);
    refreshData();
  }

  const expertsList = experts.filter(e => e.role === 'expert');
  const learnersList = experts.filter(e => e.role === 'learner');

  if (!user) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">👥</div>
        <div className="empty-state-title">Sign in to join the community</div>
        <div className="empty-state-desc">Connect with experts and learners in {categoryName}</div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'center' }}>
          {DEMO_USERS.map(u => (
            <button key={u.uid} className="btn-primary" onClick={() => signInAsDemo(u.uid)} style={{ fontSize: 'var(--text-xs)' }}>
              {getDemoAvatar(u.uid)} {u.displayName?.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>👥 Expert Directory</h2>
          <p className={styles.subtitle}>Find mentors, offer help, or learn together in {categoryName}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {myProfile ? '✏️ Edit Profile' : '➕ Join Directory'}
        </button>
      </div>

      {showForm && (
        <div className={`${styles.form} glass-card`}>
          <h3 className={styles.formTitle}>Your {categoryName} Profile</h3>
          <div className={styles.roleSelector}>
            <button
              className={`${styles.roleBtn} ${role === 'expert' ? styles.roleBtnActive : ''}`}
              onClick={() => setRole('expert')}
            >
              <span className={styles.roleIcon}>🎓</span>
              <span>Expert</span>
              <span className={styles.roleDesc}>I have experience</span>
            </button>
            <button
              className={`${styles.roleBtn} ${role === 'learner' ? styles.roleBtnActive : ''}`}
              onClick={() => setRole('learner')}
            >
              <span className={styles.roleIcon}>📚</span>
              <span>Learner</span>
              <span className={styles.roleDesc}>I&apos;m learning</span>
            </button>
          </div>
          <textarea
            className="textarea"
            placeholder="Tell others about your experience or what you want to learn..."
            value={bio}
            onChange={e => setBio(e.target.value)}
            rows={3}
          />
          <div className={styles.mentorshipSelector}>
            <span className={styles.mentorLabel}>Mentorship:</span>
            {[
              { val: 'available' as const, label: '🤝 Available to mentor', show: role === 'expert' },
              { val: 'seeking' as const, label: '🙋 Seeking a mentor', show: role === 'learner' },
              { val: 'none' as const, label: '❌ Not interested', show: true },
            ].filter(m => m.show).map(m => (
              <button
                key={m.val}
                className={`${styles.mentorBtn} ${mentorship === m.val ? styles.mentorBtnActive : ''}`}
                onClick={() => setMentorship(m.val)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className={styles.formActions}>
            {myProfile && <button className="btn-ghost" onClick={handleLeave} style={{ color: 'var(--accent-400)' }}>Leave Directory</button>}
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave}>Save Profile</button>
          </div>
        </div>
      )}

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{expertsList.length}</span>
          <span className={styles.statLabel}>Experts</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{learnersList.length}</span>
          <span className={styles.statLabel}>Learners</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{experts.filter(e => e.mentorshipStatus !== 'none').length}</span>
          <span className={styles.statLabel}>Mentorship</span>
        </div>
      </div>

      {expertsList.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>🎓 Experts</h3>
          <div className={styles.grid}>
            {expertsList.map(expert => {
              const rep = getAggregatedRating(null, 'user', expert.uid);
              return (
                <div key={expert.uid} className={`${styles.profileCard} glass-card`}>
                  <div className={styles.profileHeader}>
                    <div className={styles.profileAvatar}>{expert.displayName[0]}</div>
                    <div>
                      <h4 className={styles.profileName}>{expert.displayName}</h4>
                      {rep.count > 0 && (
                        <span className={styles.reputation}>⭐ {rep.average.toFixed(1)} ({rep.count})</span>
                      )}
                    </div>
                  </div>
                  {expert.bio && <p className={styles.profileBio}>{expert.bio}</p>}
                  {expert.mentorshipStatus === 'available' && (
                    <span className={styles.mentorBadge}>🤝 Available to mentor</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {learnersList.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>📚 Learners</h3>
          <div className={styles.grid}>
            {learnersList.map(learner => (
              <div key={learner.uid} className={`${styles.profileCard} glass-card`}>
                <div className={styles.profileHeader}>
                  <div className={styles.profileAvatar}>{learner.displayName[0]}</div>
                  <div>
                    <h4 className={styles.profileName}>{learner.displayName}</h4>
                  </div>
                </div>
                {learner.bio && <p className={styles.profileBio}>{learner.bio}</p>}
                {learner.mentorshipStatus === 'seeking' && (
                  <span className={styles.seekingBadge}>🙋 Seeking a mentor</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {experts.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
          <div className="empty-state-title">No one has joined yet</div>
          <div className="empty-state-desc">Be the first to join the {categoryName} expert directory!</div>
        </div>
      )}
    </div>
  );
}
