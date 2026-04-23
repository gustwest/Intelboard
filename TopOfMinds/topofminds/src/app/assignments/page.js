import Link from 'next/link';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/dal';

export const metadata = { title: 'Uppdrag — TopOfMinds' };
export const dynamic = 'force-dynamic';

const STATUS_CONFIG = {
  NEW:      { label: 'Nytt',      color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  MATCHED:  { label: 'Matchat',   color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  SENT:     { label: 'Skickat',   color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  CLOSED:   { label: 'Stängt',    color: '#94a3b8', bg: 'rgba(148,163,184,0.10)' },
  ARCHIVED: { label: 'Arkiverat', color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
};

const SOURCE_ICONS = { EMAIL: '✉️', MANUAL: '✏️', API: '🔌', CINODE: '🔗' };

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

function daysUntil(d) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function fmtRate(min, max, type) {
  if (!min && !max) return null;
  const suffix = type === 'MONTHLY' ? '/mån' : type === 'FIXED' ? ' fast' : '/h';
  const range = min && max ? `${min}–${max}` : min || max;
  return `${range} kr${suffix}`;
}

function durationLabel(start, end) {
  if (!start || !end) return null;
  const months = Math.round((new Date(end) - new Date(start)) / (30 * 86400000));
  return months >= 1 ? `${months} mån` : null;
}

export default async function AssignmentsPage() {
  await requireAdmin();

  const assignments = await prisma.assignment.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      matches: { select: { score: true, recommendation: true }, orderBy: { score: 'desc' } },
      applications: { select: { status: true } },
    },
  });

  const totalNew = assignments.filter((a) => a.status === 'NEW').length;
  const totalMatched = assignments.filter((a) => a.status === 'MATCHED').length;
  const urgentCount = assignments.filter((a) => {
    const d = daysUntil(a.applicationDeadline);
    return d !== null && d >= 0 && d <= 3;
  }).length;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Uppdrag</h1>
          <p className="page-subtitle">Inkomna mäklarförfrågningar. Matchas automatiskt mot konsultprofiler via AI.</p>
        </div>
        <Link href="/assignments/new" className="ai-save-btn" style={{ textDecoration: 'none', display: 'inline-block', padding: '10px 18px', whiteSpace: 'nowrap' }}>
          + Klistra in mejl
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Totalt',     value: assignments.length, color: 'var(--color-text-primary, #f1f5f9)' },
          { label: 'Nya',        value: totalNew,           color: '#60a5fa' },
          { label: 'Matchade',   value: totalMatched,       color: '#34d399' },
          { label: 'Brådskande', value: urgentCount,        color: urgentCount > 0 ? '#f87171' : '#94a3b8' },
        ].map(({ label, value, color }) => (
          <div key={label} className="ai-usage-card" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #94a3b8)', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {assignments.length === 0 ? (
        <div className="ai-usage-card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <h3>Inga uppdrag ännu</h3>
          <p className="ai-empty" style={{ marginBottom: 18 }}>
            Klistra in ett mäklarmail manuellt eller konfigurera automatintag via Postmark/Cinode.
          </p>
          <Link href="/assignments/new" className="ai-save-btn" style={{ textDecoration: 'none', display: 'inline-block', padding: '10px 22px' }}>
            + Klistra in mejl
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {assignments.map((a) => {
            const dl = daysUntil(a.applicationDeadline);
            const isUrgent = dl !== null && dl >= 0 && dl <= 3;
            const isExpired = dl !== null && dl < 0;
            const topScore = a.matches[0]?.score;
            const strong = a.matches.filter((m) => m.score >= 80).length;
            const good = a.matches.filter((m) => m.score >= 60 && m.score < 80).length;
            const applied = a.applications.filter((ap) => ['APPLIED', 'WON'].includes(ap.status)).length;
            const st = STATUS_CONFIG[a.status] || STATUS_CONFIG.NEW;
            const rate = fmtRate(a.rateMin, a.rateMax, a.rateType);
            const duration = durationLabel(a.startDate, a.endDate);

            return (
              <Link key={a.id} href={`/assignments/${a.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="ai-usage-card" style={{
                  padding: '14px 20px', cursor: 'pointer',
                  borderLeft: `3px solid ${isUrgent ? '#f87171' : isExpired ? '#334155' : st.color}`,
                  opacity: isExpired ? 0.6 : 1,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-primary, #f1f5f9)' }}>
                          {a.title}
                        </span>
                        <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: st.color, background: st.bg }}>
                          {st.label}
                        </span>
                        {isUrgent && (
                          <span style={{ fontSize: '0.68rem', color: '#f87171', fontWeight: 600 }}>
                            ⚠ {dl === 0 ? 'deadline idag' : `${dl}d kvar`}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.77rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                        {a.brokerName && <span>{SOURCE_ICONS[a.sourceType] || '📧'} {a.brokerName}</span>}
                        {a.clientName && <span>🏢 {a.clientName}</span>}
                        {a.location && <span>📍 {a.location}</span>}
                        {a.seniority && <span>⭐ {a.seniority}</span>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                      {(rate || duration) && (
                        <div style={{ textAlign: 'right' }}>
                          {rate && <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-primary, #f1f5f9)' }}>{rate}</div>}
                          {duration && <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted, #94a3b8)' }}>{duration}{a.startDate ? ` · fr ${fmtDate(a.startDate)}` : ''}</div>}
                        </div>
                      )}

                      <div style={{ textAlign: 'center', minWidth: 60 }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted, #94a3b8)', marginBottom: 2 }}>Deadline</div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 500, color: isUrgent ? '#f87171' : isExpired ? '#475569' : 'var(--color-text-secondary, #cbd5e1)' }}>
                          {a.applicationDeadline ? fmtDate(a.applicationDeadline) : '—'}
                        </div>
                      </div>

                      <div style={{ textAlign: 'center', minWidth: 80 }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted, #94a3b8)', marginBottom: 4 }}>Matchningar</div>
                        {a.matches.length === 0 ? (
                          <div style={{ fontSize: '0.78rem', color: '#475569' }}>—</div>
                        ) : (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            {strong > 0 && <span style={{ fontSize: '0.68rem', padding: '1px 7px', borderRadius: 8, background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>{strong} stark</span>}
                            {good > 0 && <span style={{ fontSize: '0.68rem', padding: '1px 7px', borderRadius: 8, background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>{good} bra</span>}
                            {topScore != null && strong === 0 && good === 0 && (
                              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>topp {topScore}%</span>
                            )}
                          </div>
                        )}
                      </div>

                      {applied > 0 && (
                        <div style={{ textAlign: 'center', minWidth: 50 }}>
                          <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted, #94a3b8)', marginBottom: 2 }}>Ansökt</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#a78bfa' }}>{applied}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
