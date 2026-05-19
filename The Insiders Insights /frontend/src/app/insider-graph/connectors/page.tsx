'use client';

import { Plug } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';

type Connector = {
  id: string;
  name: string;
  method: string;
  frequency: string;
  tier: 'standard' | 'optional' | 'custom';
  outputs: string[];
  status: 'live' | 'stub' | 'planned';
};

const CONNECTORS: Connector[] = [
  { id: 'linkedin-company', name: 'LinkedIn (företag)', method: 'scrape', frequency: 'dagligen', tier: 'standard', outputs: ['Organization', 'SocialMediaPosting', 'JobPosting'], status: 'stub' },
  { id: 'linkedin-person', name: 'LinkedIn (person)', method: 'scrape', frequency: 'dagligen', tier: 'standard', outputs: ['Person', 'SocialMediaPosting'], status: 'stub' },
  { id: 'bolagsverket', name: 'Bolagsverket', method: 'api', frequency: 'månadsvis', tier: 'standard', outputs: ['Organization'], status: 'planned' },
  { id: 'pressroom', name: 'Pressrum / RSS', method: 'rss', frequency: 'dagligen', tier: 'standard', outputs: ['NewsArticle'], status: 'planned' },
  { id: 'careers', name: 'Karriärsida', method: 'scrape', frequency: 'dagligen', tier: 'standard', outputs: ['JobPosting'], status: 'planned' },
  { id: 'email', name: 'E-post (episodisk)', method: 'email', frequency: 'realtid', tier: 'standard', outputs: ['Event', 'NewsArticle'], status: 'planned' },
  { id: 'instagram', name: 'Instagram', method: 'api + scrape', frequency: 'dagligen', tier: 'optional', outputs: ['SocialMediaPosting', 'ImageObject'], status: 'planned' },
  { id: 'youtube', name: 'YouTube', method: 'api', frequency: 'dagligen', tier: 'optional', outputs: ['VideoObject'], status: 'planned' },
  { id: 'facebook', name: 'Facebook', method: 'api + scrape', frequency: 'dagligen', tier: 'optional', outputs: ['SocialMediaPosting', 'Event'], status: 'planned' },
  { id: 'substack', name: 'Substack', method: 'rss', frequency: 'dagligen', tier: 'optional', outputs: ['NewsArticle'], status: 'planned' },
  { id: 'podcast', name: 'Podcast (RSS)', method: 'rss', frequency: 'dagligen', tier: 'optional', outputs: ['PodcastEpisode'], status: 'planned' },
  { id: 'glassdoor', name: 'Glassdoor', method: 'scrape', frequency: 'veckovis', tier: 'optional', outputs: ['EmployerReview'], status: 'planned' },
  { id: 'github', name: 'GitHub', method: 'api', frequency: 'veckovis', tier: 'optional', outputs: ['SoftwareSourceCode'], status: 'planned' },
  { id: 'crunchbase', name: 'Crunchbase', method: 'api', frequency: 'månadsvis', tier: 'optional', outputs: ['Organization', 'FundingEvent'], status: 'planned' },
  { id: 'scholar', name: 'Google Scholar', method: 'scrape', frequency: 'månadsvis', tier: 'optional', outputs: ['ScholarlyArticle'], status: 'planned' },
  { id: 'prv', name: 'PRV / Patent', method: 'api', frequency: 'månadsvis', tier: 'optional', outputs: ['CreativeWork'], status: 'planned' },
  { id: 'vinnova', name: 'Vinnova', method: 'api', frequency: 'månadsvis', tier: 'optional', outputs: ['Grant', 'ResearchProject'], status: 'planned' },
];

const tierStyle: Record<Connector['tier'], { bg: string; color: string; label: string }> = {
  standard: { bg: 'rgba(45,212,191,0.12)', color: '#2dd4bf', label: 'standard' },
  optional: { bg: 'rgba(96,165,250,0.12)', color: '#60a5fa', label: 'valfri' },
  custom: { bg: 'rgba(251,113,133,0.12)', color: '#fb7185', label: 'kundspecifik' },
};

const statusStyle: Record<Connector['status'], { color: string; label: string }> = {
  live: { color: '#22c55e', label: 'Live' },
  stub: { color: '#f59e0b', label: 'Stub' },
  planned: { color: 'rgba(255,255,255,0.4)', label: 'Planerad' },
};

export default function GraphConnectorsPage() {
  return (
    <GraphPageShell
      title="Connectors"
      icon={<Plug size={22} />}
      subtitle="Datakällor som connectors levererar Schema.org-objekt till GEO-motorn. Alla implementerar samma interface."
    >
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr 1fr',
            gap: 12,
            padding: '12px 20px',
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: C.muted,
            borderBottom: `1px solid ${C.border}`,
            fontWeight: 600,
          }}
        >
          <span>Connector</span>
          <span>Metod</span>
          <span>Frekvens</span>
          <span>Tier</span>
          <span>Output</span>
          <span>Status</span>
        </div>
        {CONNECTORS.map((c) => (
          <div
            key={c.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr 1fr',
              gap: 12,
              padding: '14px 20px',
              borderBottom: `1px solid ${C.border}`,
              fontSize: 13,
              alignItems: 'center',
            }}
          >
            <span style={{ color: '#fff', fontWeight: 500 }}>{c.name}</span>
            <span style={{ color: C.muted }}>{c.method}</span>
            <span style={{ color: C.muted }}>{c.frequency}</span>
            <span>
              <span
                style={{
                  fontSize: 10,
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: tierStyle[c.tier].bg,
                  color: tierStyle[c.tier].color,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                {tierStyle[c.tier].label}
              </span>
            </span>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {c.outputs.map((o) => (
                <span
                  key={o}
                  style={{
                    fontSize: 10,
                    padding: '2px 7px',
                    borderRadius: 4,
                    background: 'rgba(124,109,250,0.12)',
                    color: '#7c6dfa',
                    fontWeight: 500,
                  }}
                >
                  {o}
                </span>
              ))}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: statusStyle[c.status].color,
                }}
              />
              <span style={{ fontSize: 12, color: C.muted }}>{statusStyle[c.status].label}</span>
            </span>
          </div>
        ))}
      </div>
    </GraphPageShell>
  );
}
