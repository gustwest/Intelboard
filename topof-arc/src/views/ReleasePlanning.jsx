import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Calendar, Plus, ChevronLeft, ChevronRight, AlertTriangle, X } from 'lucide-react';

const cycleLabels = {
  weekly: 'Veckovis',
  biweekly: 'Varannan vecka',
  monthly: 'Månatlig',
  quarterly: 'Kvartalsvis',
  'ad-hoc': 'Ad hoc',
};

const statusColors = {
  planned: 'var(--accent-blue)',
  'in-progress': 'var(--accent-amber)',
  released: 'var(--accent-green)',
  cancelled: 'var(--accent-red)',
};

export default function ReleasePlanning() {
  const managementAreas = useLiveQuery(() => db.managementAreas.toArray(), []) || [];
  const releases = useLiveQuery(() => db.releases.toArray(), []) || [];
  const systems = useLiveQuery(() => db.systems.toArray(), []) || [];
  const integrations = useLiveQuery(() => db.integrations.toArray(), []) || [];

  const [showCreateRelease, setShowCreateRelease] = useState(false);
  const [viewOffset, setViewOffset] = useState(0); // weeks offset

  // Timeline: show 8 weeks from today
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() + viewOffset * 7);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 8 * 7);

  const totalDays = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));

  // Week markers
  const weeks = useMemo(() => {
    const w = [];
    for (let i = 0; i < 8; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i * 7);
      w.push(d);
    }
    return w;
  }, [startDate.toISOString()]);

  const getPositionPercent = (dateStr) => {
    const d = new Date(dateStr);
    const diff = d - startDate;
    return (diff / (endDate - startDate)) * 100;
  };

  // Find cross-area dependencies
  const dependencies = useMemo(() => {
    const deps = [];
    // If a release affects a system that has integrations to systems in other releases
    releases.forEach(r1 => {
      const affectedSystems = r1.affectedSystemIds || [];
      affectedSystems.forEach(sysId => {
        // Find integrations where this system is source or target  
        const relatedIntegrations = integrations.filter(
          i => i.sourceSystemId === sysId || i.targetSystemId === sysId
        );
        relatedIntegrations.forEach(integ => {
          const otherSysId = integ.sourceSystemId === sysId ? integ.targetSystemId : integ.sourceSystemId;
          // Check if otherSysId is in another release
          releases.forEach(r2 => {
            if (r2.id === r1.id) return;
            if ((r2.affectedSystemIds || []).includes(otherSysId)) {
              deps.push({ from: r1, to: r2, via: integ });
            }
          });
        });
      });
    });
    return deps;
  }, [releases, integrations]);

  const systemMap = useMemo(() => {
    const m = {};
    systems.forEach(s => m[s.id] = s);
    return m;
  }, [systems]);

  // Create release form
  const [newRelease, setNewRelease] = useState({
    name: '', version: '', plannedDate: '', status: 'planned',
    managementAreaId: null, affectedSystemIds: [],
  });

  const handleCreateRelease = async (e) => {
    e.preventDefault();
    if (!newRelease.name || !newRelease.managementAreaId) return;
    await db.releases.add({
      ...newRelease,
      managementAreaId: Number(newRelease.managementAreaId),
    });
    setNewRelease({ name: '', version: '', plannedDate: '', status: 'planned', managementAreaId: null, affectedSystemIds: [] });
    setShowCreateRelease(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--border-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-xl)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={22} style={{ color: 'var(--accent-cyan)' }} />
            Release-planering
          </h1>
          <p className="text-sm text-secondary" style={{ marginTop: 4 }}>
            Planera och takta releaser per förvaltningsområde. Beroenden visas automatiskt.
          </p>
        </div>
        <div className="flex gap-sm items-center">
          <button className="btn btn-ghost btn-sm" onClick={() => setViewOffset(v => v - 4)}><ChevronLeft size={14} /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => setViewOffset(0)}>Idag</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setViewOffset(v => v + 4)}><ChevronRight size={14} /></button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreateRelease(true)}>
            <Plus size={14} /> Ny release
          </button>
        </div>
      </div>

      {/* Dependencies banner */}
      {dependencies.length > 0 && (
        <div style={{
          padding: 'var(--space-sm) var(--space-lg)',
          background: 'rgba(245, 158, 11, 0.08)',
          borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 'var(--font-sm)',
          color: 'var(--accent-amber)',
        }}>
          <AlertTriangle size={14} />
          <span>{dependencies.length} beroende(n) mellan releaser detekterade — system delar integrationer som påverkas</span>
        </div>
      )}

      {/* Timeline */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-lg)' }}>
        {/* Week headers */}
        <div style={{ display: 'flex', marginLeft: 176, marginBottom: 'var(--space-sm)' }}>
          {weeks.map((w, i) => (
            <div key={i} style={{
              width: `${100 / 8}%`,
              textAlign: 'center',
              fontSize: '10px',
              color: 'var(--text-tertiary)',
              borderLeft: '1px solid var(--border-secondary)',
              paddingLeft: 4,
            }}>
              v.{getWeekNumber(w)} · {w.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
            </div>
          ))}
        </div>

        {/* Area rows */}
        {managementAreas.map(area => {
          const areaReleases = releases.filter(r => r.managementAreaId === area.id);

          return (
            <div key={area.id} className="timeline-row">
              <div className="timeline-area-label">
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: area.color, flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600 }}>{area.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{cycleLabels[area.releaseCycle]}</div>
                </div>
              </div>
              <div className="timeline-track">
                {/* Week grid lines */}
                {weeks.map((w, i) => (
                  <div key={i} style={{
                    position: 'absolute',
                    left: `${(i / 8) * 100}%`,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    background: 'var(--border-secondary)',
                  }} />
                ))}

                {/* Today line */}
                {(() => {
                  const p = getPositionPercent(today.toISOString());
                  if (p >= 0 && p <= 100) {
                    return (
                      <div style={{
                        position: 'absolute',
                        left: `${p}%`,
                        top: 0,
                        bottom: 0,
                        width: 2,
                        background: 'var(--accent-red)',
                        zIndex: 5,
                        opacity: 0.6,
                      }} />
                    );
                  }
                  return null;
                })()}

                {/* Releases */}
                {areaReleases.map(release => {
                  const pos = getPositionPercent(release.plannedDate);
                  if (pos < -5 || pos > 105) return null;

                  const hasDep = dependencies.some(d => d.from.id === release.id || d.to.id === release.id);

                  return (
                    <div
                      key={release.id}
                      className="timeline-release"
                      style={{
                        left: `${Math.max(0, pos - 5)}%`,
                        width: '10%',
                        minWidth: 80,
                        background: `${statusColors[release.status]}20`,
                        border: `1px solid ${statusColors[release.status]}50`,
                        color: statusColors[release.status],
                        boxShadow: hasDep ? `0 0 8px ${statusColors[release.status]}30` : 'none',
                      }}
                      title={`${release.name} (${release.version}) — ${release.plannedDate}`}
                    >
                      {hasDep && <AlertTriangle size={10} style={{ marginRight: 3, flexShrink: 0 }} />}
                      {release.name}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Dependencies detail */}
        {dependencies.length > 0 && (
          <div style={{ marginTop: 'var(--space-xl)' }}>
            <h3 style={{ fontSize: 'var(--font-md)', fontWeight: 600, marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} style={{ color: 'var(--accent-amber)' }} />
              Identifierade beroenden
            </h3>
            <div className="flex flex-col gap-sm">
              {dependencies.map((dep, i) => (
                <div key={i} className="card" style={{ padding: 'var(--space-md)' }}>
                  <div className="flex items-center gap-sm text-sm">
                    <span className="font-semibold" style={{ color: 'var(--accent-amber)' }}>{dep.from.name}</span>
                    <span className="text-tertiary">→</span>
                    <span className="font-semibold" style={{ color: 'var(--accent-blue)' }}>{dep.to.name}</span>
                  </div>
                  <div className="text-xs text-secondary" style={{ marginTop: 4 }}>
                    Via integration: {dep.via.description || `${dep.via.type} ${dep.via.protocol}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Release Modal */}
      {showCreateRelease && (
        <div className="modal-overlay" onClick={() => setShowCreateRelease(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Ny release</h2>
              <button className="detail-panel-close" onClick={() => setShowCreateRelease(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateRelease}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Release-namn *</label>
                    <input className="form-input" value={newRelease.name} onChange={e => setNewRelease({ ...newRelease, name: e.target.value })} placeholder="T.ex. CRM v4.3" autoFocus />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Version</label>
                    <input className="form-input" value={newRelease.version} onChange={e => setNewRelease({ ...newRelease, version: e.target.value })} placeholder="T.ex. 4.3" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Planerat datum</label>
                    <input type="date" className="form-input" value={newRelease.plannedDate} onChange={e => setNewRelease({ ...newRelease, plannedDate: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Förvaltningsområde *</label>
                    <select className="form-select" value={newRelease.managementAreaId || ''} onChange={e => setNewRelease({ ...newRelease, managementAreaId: e.target.value })}>
                      <option value="">— Välj —</option>
                      {managementAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Berörda system</label>
                  <div className="flex gap-xs flex-wrap">
                    {systems.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        className={`btn btn-sm ${newRelease.affectedSystemIds?.includes(s.id) ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ fontSize: '10px', padding: '2px 8px' }}
                        onClick={() => {
                          const ids = newRelease.affectedSystemIds || [];
                          const updated = ids.includes(s.id) ? ids.filter(id => id !== s.id) : [...ids, s.id];
                          setNewRelease({ ...newRelease, affectedSystemIds: updated });
                        }}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setShowCreateRelease(false)}>Avbryt</button>
                <button type="submit" className="btn btn-primary">Skapa release</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}
