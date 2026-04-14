'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

function parseJSON(s) {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

function SkillLevel({ level }) {
  const levels = { native: 5, fluent: 4, basic: 2 };
  const n = levels[level] || 3;
  return (
    <span className="cv-lang-dots">
      {[1,2,3,4,5].map(i => (
        <span key={i} className={`cv-lang-dot ${i <= n ? 'filled' : ''}`} />
      ))}
    </span>
  );
}

export default function CVPage() {
  const params = useParams();
  const [consultant, setConsultant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/consultants/${params.id}`)
      .then(r => r.json())
      .then(d => { setConsultant(d); setLoading(false); });
  }, [params.id]);

  if (loading) return <div className="fade-in" style={{ textAlign: 'center', paddingTop: '100px' }}><p style={{ color: 'var(--color-text-muted)' }}>Laddar CV...</p></div>;
  if (!consultant) return <div className="empty-state"><p>Konsult hittades inte</p></div>;

  const name = `${consultant.firstName} ${consultant.lastName}`;
  const skills = parseJSON(consultant.skills);
  const education = parseJSON(consultant.education);
  const experience = parseJSON(consultant.experience);
  const certifications = parseJSON(consultant.certifications);
  const languages = parseJSON(consultant.languages);
  const employmentHistory = parseJSON(consultant.employmentHistory);
  const industryExpertise = parseJSON(consultant.industryExpertise);

  return (
    <>
      <style>{`
        @media print {
          body { background: white !important; color: #1a1a2e !important; }
          .sidebar, .cv-actions, .cv-back-link { display: none !important; }
          .cv-page { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
          .cv-container { background: white !important; border: none !important; box-shadow: none !important; backdrop-filter: none !important; }
          .cv-header { background: linear-gradient(135deg, #1a1a2e, #16213e) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .cv-section { break-inside: avoid; }
          .cv-assignment-card { background: #f8f9fa !important; border: 1px solid #e2e8f0 !important; box-shadow: none !important; backdrop-filter: none !important; }
          .cv-skill-tag { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .cv-lang-dot.filled { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .cv-branding { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }

        .cv-page {
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
        }

        .cv-container {
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 24px rgba(0,0,0,0.15);
        }

        .cv-header {
          background: linear-gradient(135deg, hsl(220, 70%, 15%), hsl(250, 50%, 20%));
          padding: 40px 48px;
          display: flex;
          align-items: center;
          gap: 28px;
          position: relative;
          overflow: hidden;
        }

        .cv-header::before {
          content: '';
          position: absolute;
          top: -50%;
          right: -20%;
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, hsla(220, 70%, 50%, 0.15), transparent);
          border-radius: 50%;
        }

        .cv-avatar {
          width: 90px;
          height: 90px;
          border-radius: 50%;
          background: linear-gradient(135deg, hsl(220, 70%, 55%), hsl(260, 60%, 55%));
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          font-weight: 700;
          color: white;
          flex-shrink: 0;
          border: 3px solid rgba(255,255,255,0.2);
          box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        }

        .cv-header-info { flex: 1; z-index: 1; }

        .cv-name {
          font-size: 28px;
          font-weight: 800;
          color: white;
          margin-bottom: 4px;
          letter-spacing: -0.5px;
        }

        .cv-title-main {
          font-size: 16px;
          color: hsla(220, 80%, 80%, 0.9);
          font-weight: 500;
          margin-bottom: 12px;
        }

        .cv-contact-row {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          font-size: 13px;
          color: hsla(0, 0%, 100%, 0.7);
        }

        .cv-contact-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .cv-body { padding: 36px 48px; }

        .cv-section {
          margin-bottom: 32px;
        }

        .cv-section-title {
          font-size: 14px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--color-primary);
          margin-bottom: 16px;
          padding-bottom: 8px;
          border-bottom: 2px solid var(--color-border);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .cv-profile-text {
          font-size: 15px;
          line-height: 1.7;
          color: var(--color-text-secondary);
        }

        .cv-skills-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .cv-skill-tag {
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          background: linear-gradient(135deg, hsla(220, 70%, 55%, 0.15), hsla(260, 60%, 55%, 0.1));
          color: var(--color-primary);
          border: 1px solid hsla(220, 70%, 55%, 0.2);
          transition: all 0.2s ease;
        }

        .cv-skill-tag:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 8px hsla(220, 70%, 55%, 0.2);
        }

        .cv-industry-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .cv-industry-tag {
          padding: 5px 12px;
          border-radius: 6px;
          font-size: 13px;
          background: var(--color-bg-hover);
          color: var(--color-text-secondary);
          border: 1px solid var(--color-border);
        }

        .cv-assignment-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 12px;
          backdrop-filter: blur(8px);
          transition: all 0.2s ease;
        }

        .cv-assignment-card:hover {
          border-color: var(--color-primary);
          box-shadow: 0 2px 12px hsla(220, 70%, 55%, 0.1);
        }

        .cv-assignment-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 8px;
          flex-wrap: wrap;
        }

        .cv-assignment-customer {
          font-size: 15px;
          font-weight: 700;
          color: var(--color-text-primary);
        }

        .cv-assignment-period {
          font-size: 12px;
          color: var(--color-text-muted);
          background: var(--color-bg-hover);
          padding: 3px 10px;
          border-radius: 12px;
          white-space: nowrap;
        }

        .cv-assignment-role {
          font-size: 13px;
          font-weight: 600;
          color: var(--color-primary);
          margin-bottom: 6px;
        }

        .cv-assignment-desc {
          font-size: 13px;
          line-height: 1.6;
          color: var(--color-text-secondary);
        }

        .cv-edu-item, .cv-cert-item, .cv-emp-item {
          display: flex;
          align-items: baseline;
          gap: 12px;
          padding: 8px 0;
          border-bottom: 1px solid var(--color-border);
          font-size: 14px;
        }

        .cv-edu-item:last-child, .cv-cert-item:last-child, .cv-emp-item:last-child {
          border-bottom: none;
        }

        .cv-edu-bullet, .cv-cert-bullet {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--color-primary);
          flex-shrink: 0;
          margin-top: 6px;
        }

        .cv-emp-period {
          font-size: 12px;
          color: var(--color-text-muted);
          min-width: 120px;
          flex-shrink: 0;
        }

        .cv-emp-company {
          font-weight: 600;
          color: var(--color-text-primary);
        }

        .cv-emp-role {
          color: var(--color-text-secondary);
          font-size: 13px;
        }

        .cv-lang-row {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 8px 0;
        }

        .cv-lang-name {
          min-width: 100px;
          font-weight: 600;
          font-size: 14px;
          color: var(--color-text-primary);
        }

        .cv-lang-dots {
          display: flex;
          gap: 4px;
        }

        .cv-lang-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--color-bg-hover);
          border: 1px solid var(--color-border);
        }

        .cv-lang-dot.filled {
          background: var(--color-primary);
          border-color: var(--color-primary);
        }

        .cv-lang-level {
          font-size: 12px;
          color: var(--color-text-muted);
          text-transform: capitalize;
        }

        .cv-two-cols {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }

        @media (max-width: 700px) {
          .cv-two-cols { grid-template-columns: 1fr; }
          .cv-header { padding: 24px; flex-direction: column; text-align: center; }
          .cv-contact-row { justify-content: center; }
          .cv-body { padding: 24px; }
        }

        .cv-branding {
          text-align: center;
          padding: 20px 48px;
          border-top: 1px solid var(--color-border);
          background: linear-gradient(135deg, hsla(220, 70%, 15%, 0.5), hsla(250, 50%, 20%, 0.5));
        }

        .cv-branding-text {
          font-size: 12px;
          color: var(--color-text-muted);
          letter-spacing: 2px;
          text-transform: uppercase;
          font-weight: 600;
        }

        .cv-branding-sub {
          font-size: 11px;
          color: var(--color-text-muted);
          opacity: 0.6;
          margin-top: 4px;
        }

        .cv-actions {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
          align-items: center;
        }
      `}</style>

      <div className="cv-page fade-in">
        <div className="cv-actions">
          <Link href={`/consultants/${consultant.id}`} className="btn btn-ghost btn-sm cv-back-link">← Tillbaka</Link>
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>🖨️ Skriv ut / PDF</button>
        </div>

        <div className="cv-container">
          {/* Header */}
          <div className="cv-header">
            <div className="cv-avatar">
              {consultant.firstName[0]}{consultant.lastName[0]}
            </div>
            <div className="cv-header-info">
              <div className="cv-name">{name}</div>
              <div className="cv-title-main">{consultant.title}</div>
              <div className="cv-contact-row">
                {consultant.email && <span className="cv-contact-item">📧 {consultant.email}</span>}
                {consultant.phone && <span className="cv-contact-item">📱 {consultant.phone}</span>}
                {consultant.address && <span className="cv-contact-item">📍 {consultant.address}</span>}
                {consultant.nationality && <span className="cv-contact-item">🌍 {consultant.nationality}</span>}
              </div>
            </div>
          </div>

          <div className="cv-body">
            {/* Profile */}
            {consultant.bio && (
              <div className="cv-section">
                <div className="cv-section-title">Profil</div>
                <p className="cv-profile-text">{consultant.bio}</p>
              </div>
            )}

            {/* Two column: Skills + Industries */}
            <div className="cv-two-cols">
              {skills.length > 0 && (
                <div className="cv-section">
                  <div className="cv-section-title">Specialistkompetens</div>
                  <div className="cv-skills-grid">
                    {skills.map(skill => <span key={skill} className="cv-skill-tag">{skill}</span>)}
                  </div>
                </div>
              )}

              {industryExpertise.length > 0 && (
                <div className="cv-section">
                  <div className="cv-section-title">Branschkompetens</div>
                  <div className="cv-industry-tags">
                    {industryExpertise.map(ind => <span key={ind} className="cv-industry-tag">{ind}</span>)}
                  </div>
                </div>
              )}
            </div>

            {/* Assignments */}
            {experience.length > 0 && (
              <div className="cv-section">
                <div className="cv-section-title">Uppdragshistorik</div>
                {experience.map((exp, i) => (
                  <div key={i} className="cv-assignment-card">
                    <div className="cv-assignment-header">
                      <div className="cv-assignment-customer">📌 {exp.customer}</div>
                      <span className="cv-assignment-period">{exp.period}</span>
                    </div>
                    <div className="cv-assignment-role">🎯 {exp.role}</div>
                    <div className="cv-assignment-desc">{exp.description}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Two column: Education + Certifications */}
            <div className="cv-two-cols">
              {education.length > 0 && (
                <div className="cv-section">
                  <div className="cv-section-title">Utbildning</div>
                  {education.map((edu, i) => (
                    <div key={i} className="cv-edu-item">
                      <span className="cv-edu-bullet" />
                      <span style={{ color: 'var(--color-text-secondary)' }}>{edu}</span>
                    </div>
                  ))}
                </div>
              )}

              {certifications.length > 0 && (
                <div className="cv-section">
                  <div className="cv-section-title">Certifieringar</div>
                  {certifications.map((cert, i) => (
                    <div key={i} className="cv-cert-item">
                      <span className="cv-cert-bullet" />
                      <span style={{ color: 'var(--color-text-secondary)' }}>
                        {cert.name}{cert.year ? ` (${cert.year})` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Employment history */}
            {employmentHistory.length > 0 && (
              <div className="cv-section">
                <div className="cv-section-title">Anställningar</div>
                {employmentHistory.map((emp, i) => (
                  <div key={i} className="cv-emp-item">
                    <span className="cv-emp-period">{emp.period}</span>
                    <div>
                      <span className="cv-emp-company">{emp.company}</span>
                      {emp.role && <span className="cv-emp-role"> — {emp.role}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Languages */}
            {languages.length > 0 && (
              <div className="cv-section">
                <div className="cv-section-title">Språk</div>
                {languages.map((lang, i) => (
                  <div key={i} className="cv-lang-row">
                    <span className="cv-lang-name">{lang.language}</span>
                    <SkillLevel level={lang.level} />
                    <span className="cv-lang-level">
                      {lang.level === 'native' ? 'Modersmål' : lang.level === 'fluent' ? 'Flytande' : 'Grundläggande'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Branding footer */}
          <div className="cv-branding">
            <div className="cv-branding-text">Top of Minds</div>
            <div className="cv-branding-sub">Biblioteksgatan 29, 114 35 Stockholm · topofminds.se</div>
          </div>
        </div>
      </div>
    </>
  );
}
