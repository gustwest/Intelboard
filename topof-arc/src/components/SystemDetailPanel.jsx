import { useState, useEffect } from 'react';
import { X, Database, Users, GitBranch, FileText, MessageSquare, Send, ArrowRight, Pencil, Trash2, Save, Plus, Shield, AlertTriangle } from 'lucide-react';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

const roleLabels = {
  data_owner: 'Dataägare',
  information_owner: 'Informationsägare',
  data_product_owner: 'Dataproduktsägare',
  technical_owner: 'Teknisk ägare',
};

const statusLabels = {
  current: 'Aktiv',
  target: 'Målbild',
  planned: 'Planerad',
  deprecated: 'Avvecklad',
};

const classificationColors = {
  public: { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)', color: 'var(--accent-green)' },
  internal: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', color: 'var(--accent-blue)' },
  confidential: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', color: 'var(--accent-amber)' },
  restricted: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', color: 'var(--accent-red)' },
};

const complianceTags = ['GDPR', 'PCI-DSS', 'SOX', 'HIPAA', 'ISO 27001'];

export default function SystemDetailPanel({ system, area, owners, dataEntities, integrations, allSystems, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [newAnnotation, setNewAnnotation] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  
  // Inline add states
  const [showAddOwner, setShowAddOwner] = useState(false);
  const [newOwner, setNewOwner] = useState({ name: '', email: '', role: 'data_owner' });
  const [showAddData, setShowAddData] = useState(false);
  const [newData, setNewData] = useState({ name: '', type: 'table', classification: 'internal', description: '' });
  const [showAddIntegration, setShowAddIntegration] = useState(false);
  const [newInteg, setNewInteg] = useState({ targetSystemId: '', type: 'API', protocol: 'REST', frequency: 'realtime', direction: 'unidirectional', description: '' });

  const annotations = useLiveQuery(
    () => db.annotations.where({ entityType: 'system', entityId: system.id }).toArray(),
    [system.id]
  ) || [];

  const contracts = useLiveQuery(
    () => db.contracts.toArray().then(all => all.filter(c => c.systemIds?.includes(system.id))),
    [system.id]
  ) || [];

  useEffect(() => {
    setEditData({
      name: system.name,
      description: system.description,
      type: system.type,
      status: system.status,
      complianceTags: system.complianceTags || [],
    });
  }, [system]);

  const handleSave = async () => {
    await db.systems.update(system.id, editData);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    const integCount = integrations.length;
    if (confirm(`Radera ${system.name}? ${integCount > 0 ? `\n\n⚠️ OBS: ${integCount} integration(er) kommer också att raderas.` : ''}`)) {
      await db.integrations.where('sourceSystemId').equals(system.id).delete();
      await db.integrations.where('targetSystemId').equals(system.id).delete();
      await db.dataEntities.where('systemId').equals(system.id).delete();
      await db.owners.where('systemId').equals(system.id).delete();
      await db.annotations.where({ entityType: 'system', entityId: system.id }).delete();
      await db.systems.delete(system.id);
      onClose();
    }
  };

  const handleAddOwner = async () => {
    if (!newOwner.name.trim()) return;
    await db.owners.add({ ...newOwner, systemId: system.id });
    setNewOwner({ name: '', email: '', role: 'data_owner' });
    setShowAddOwner(false);
  };

  const handleDeleteOwner = async (id) => {
    await db.owners.delete(id);
  };

  const handleAddData = async () => {
    if (!newData.name.trim()) return;
    await db.dataEntities.add({ ...newData, systemId: system.id });
    setNewData({ name: '', type: 'table', classification: 'internal', description: '' });
    setShowAddData(false);
  };

  const handleDeleteData = async (id) => {
    await db.dataEntities.delete(id);
  };

  const handleAddIntegration = async () => {
    if (!newInteg.targetSystemId) return;
    await db.integrations.add({
      sourceSystemId: system.id,
      targetSystemId: Number(newInteg.targetSystemId),
      type: newInteg.type,
      protocol: newInteg.protocol,
      frequency: newInteg.frequency,
      direction: newInteg.direction,
      description: newInteg.description,
      status: 'active',
    });
    setNewInteg({ targetSystemId: '', type: 'API', protocol: 'REST', frequency: 'realtime', direction: 'unidirectional', description: '' });
    setShowAddIntegration(false);
  };

  const handleDeleteIntegration = async (id) => {
    if (confirm('Radera denna integration?')) {
      await db.integrations.delete(id);
    }
  };

  const handleAddAnnotation = async () => {
    if (!newAnnotation.trim()) return;
    await db.annotations.add({
      entityType: 'system',
      entityId: system.id,
      author: 'Mig',
      content: newAnnotation.trim(),
      createdAt: new Date().toISOString(),
      replies: [],
    });
    setNewAnnotation('');
  };

  const toggleComplianceTag = (tag) => {
    const tags = editData.complianceTags || [];
    const updated = tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag];
    setEditData({ ...editData, complianceTags: updated });
  };

  const getSystemName = (id) => allSystems.find((s) => s.id === id)?.name || 'Okänt system';

  return (
    <div className="detail-panel open">
      <div className="detail-panel-header">
        <div className="flex items-center gap-sm">
          <div
            style={{
              width: 36, height: 36, borderRadius: 'var(--radius-md)',
              background: `${system.color || '#7c3aed'}20`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: system.color || '#7c3aed', fontWeight: 700, fontSize: '14px',
            }}
          >
            {system.name?.charAt(0)}
          </div>
          {isEditing ? (
            <input
              className="form-input"
              value={editData.name}
              onChange={(e) => setEditData({ ...editData, name: e.target.value })}
              style={{ width: 200 }}
            />
          ) : (
            <span className="detail-panel-title">{system.name}</span>
          )}
        </div>
        <div className="flex items-center gap-xs">
          {isEditing ? (
            <button className="btn btn-sm btn-primary" onClick={handleSave}><Save size={12} /> Spara</button>
          ) : (
            <button className="btn btn-sm btn-ghost" onClick={() => setIsEditing(true)}><Pencil size={12} /></button>
          )}
          <button className="btn btn-sm btn-danger" onClick={handleDelete}><Trash2 size={12} /></button>
          <button className="detail-panel-close" onClick={onClose}><X size={18} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ padding: '0 var(--space-lg)' }}>
        {[
          { id: 'overview', label: 'Översikt' },
          { id: 'integrations', label: `Integrationer (${integrations.length})` },
          { id: 'data', label: `Data (${dataEntities.length})` },
          { id: 'notes', label: `Anteckningar (${annotations.length})` },
        ].map((t) => (
          <button
            key={t.id}
            className={`tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="detail-panel-body">
        {activeTab === 'overview' && (
          <>
            <div className="detail-section">
              <div className="detail-section-title">System Information</div>
              <div className="detail-field">
                <div className="detail-label">Status</div>
                {isEditing ? (
                  <select className="form-select" value={editData.status} onChange={(e) => setEditData({ ...editData, status: e.target.value })} style={{ width: 140 }}>
                    {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                ) : (
                  <span className={`badge badge-${system.status}`}>{statusLabels[system.status]}</span>
                )}
              </div>
              <div className="detail-field">
                <div className="detail-label">Typ</div>
                {isEditing ? (
                  <select className="form-select" value={editData.type} onChange={(e) => setEditData({ ...editData, type: e.target.value })} style={{ width: 140 }}>
                    {['application', 'platform', 'database', 'external'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : (
                  <div className="detail-value">{system.type}</div>
                )}
              </div>
              <div className="detail-field">
                <div className="detail-label">Beskrivning</div>
                {isEditing ? (
                  <textarea
                    className="form-textarea"
                    value={editData.description || ''}
                    onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  />
                ) : (
                  <div className="detail-value">{system.description || '—'}</div>
                )}
              </div>
              {area && (
                <div className="detail-field">
                  <div className="detail-label">Förvaltningsområde</div>
                  <div className="flex items-center gap-sm">
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: area.color, display: 'inline-block' }} />
                    <span className="detail-value">{area.name}</span>
                    <span className="badge badge-active" style={{ fontSize: '9px' }}>{area.releaseCycle}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Compliance Tags */}
            <div className="detail-section">
              <div className="detail-section-title"><Shield size={14} /> Compliance & Regelverk</div>
              <div className="flex gap-xs flex-wrap">
                {complianceTags.map(tag => {
                  const active = (isEditing ? editData.complianceTags : system.complianceTags || []).includes(tag);
                  return (
                    <button
                      key={tag}
                      className={`btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ fontSize: '10px', padding: '2px 8px' }}
                      onClick={() => isEditing && toggleComplianceTag(tag)}
                      disabled={!isEditing}
                    >
                      {tag}
                    </button>
                  );
                })}
                {!isEditing && (system.complianceTags || []).length === 0 && (
                  <span className="text-xs text-tertiary">Inga compliance-taggar (redigera för att lägga till)</span>
                )}
              </div>
            </div>

            {/* Owners */}
            <div className="detail-section">
              <div className="detail-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="flex items-center gap-xs"><Users size={14} /> Ägarskap</span>
                <button className="btn btn-sm btn-ghost" onClick={() => setShowAddOwner(!showAddOwner)}><Plus size={12} /></button>
              </div>
              {showAddOwner && (
                <div className="card" style={{ padding: 'var(--space-md)', marginBottom: 'var(--space-sm)' }}>
                  <div className="form-row">
                    <input className="form-input" placeholder="Namn *" value={newOwner.name} onChange={(e) => setNewOwner({ ...newOwner, name: e.target.value })} />
                    <input className="form-input" placeholder="E-post" value={newOwner.email} onChange={(e) => setNewOwner({ ...newOwner, email: e.target.value })} />
                  </div>
                  <div className="form-row" style={{ marginTop: 8 }}>
                    <select className="form-select" value={newOwner.role} onChange={(e) => setNewOwner({ ...newOwner, role: e.target.value })}>
                      {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <div className="flex gap-xs">
                      <button className="btn btn-sm btn-primary" onClick={handleAddOwner}>Lägg till</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setShowAddOwner(false)}>Avbryt</button>
                    </div>
                  </div>
                </div>
              )}
              {owners.length === 0 && !showAddOwner && <div className="text-sm text-tertiary">Inga ägare registrerade</div>}
              <div className="flex flex-col gap-sm">
                {owners.map((owner) => (
                  <div key={owner.id} className="owner-chip" style={{ justifyContent: 'space-between' }}>
                    <div className="flex items-center gap-sm">
                      <div className="owner-avatar">{owner.name?.charAt(0)}</div>
                      <span>{owner.name}</span>
                      <span className="owner-role">{roleLabels[owner.role] || owner.role}</span>
                    </div>
                    <button className="btn btn-sm btn-ghost" style={{ opacity: 0.5, padding: 2 }} onClick={() => handleDeleteOwner(owner.id)}><Trash2 size={10} /></button>
                  </div>
                ))}
              </div>
            </div>

            {contracts.length > 0 && (
              <div className="detail-section">
                <div className="detail-section-title"><FileText size={14} /> Kontrakt</div>
                <div className="flex flex-col gap-sm">
                  {contracts.map((c) => (
                    <div key={c.id} className="card" style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                      <div className="text-sm font-semibold">{c.title}</div>
                      <div className="flex items-center gap-sm mt-md">
                        <span className={`badge badge-${c.status}`}>{c.status}</span>
                        <span className="text-xs text-tertiary">{c.type}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'integrations' && (
          <div className="detail-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
              <span className="text-sm text-secondary">{integrations.length} integration(er)</span>
              <button className="btn btn-sm btn-primary" onClick={() => setShowAddIntegration(!showAddIntegration)}><Plus size={12} /> Ny integration</button>
            </div>

            {showAddIntegration && (
              <div className="card" style={{ padding: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label className="form-label" style={{ fontSize: '10px' }}>Målsystem *</label>
                  <select className="form-select" value={newInteg.targetSystemId} onChange={(e) => setNewInteg({ ...newInteg, targetSystemId: e.target.value })}>
                    <option value="">— Välj —</option>
                    {allSystems.filter(s => s.id !== system.id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-row" style={{ marginBottom: 8 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '10px' }}>Typ</label>
                    <select className="form-select" value={newInteg.type} onChange={(e) => setNewInteg({ ...newInteg, type: e.target.value })}>
                      {['API', 'Event', 'Batch', 'File', 'Database', 'Manual'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '10px' }}>Protokoll</label>
                    <select className="form-select" value={newInteg.protocol} onChange={(e) => setNewInteg({ ...newInteg, protocol: e.target.value })}>
                      {['REST', 'GraphQL', 'gRPC', 'SOAP', 'Kafka', 'RabbitMQ', 'SFTP', 'JDBC', 'WebSocket'].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row" style={{ marginBottom: 8 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '10px' }}>Frekvens</label>
                    <select className="form-select" value={newInteg.frequency} onChange={(e) => setNewInteg({ ...newInteg, frequency: e.target.value })}>
                      {['realtime', 'near-realtime', 'hourly', 'daily', 'weekly', 'monthly', 'on-demand'].map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '10px' }}>Riktning</label>
                    <select className="form-select" value={newInteg.direction} onChange={(e) => setNewInteg({ ...newInteg, direction: e.target.value })}>
                      <option value="unidirectional">Envägs</option>
                      <option value="bidirectional">Tvåvägs</option>
                    </select>
                  </div>
                </div>
                <input className="form-input" placeholder="Beskrivning" value={newInteg.description} onChange={(e) => setNewInteg({ ...newInteg, description: e.target.value })} style={{ marginBottom: 8 }} />
                <div className="flex gap-xs">
                  <button className="btn btn-sm btn-primary" onClick={handleAddIntegration}>Lägg till</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setShowAddIntegration(false)}>Avbryt</button>
                </div>
              </div>
            )}

            {integrations.length === 0 && !showAddIntegration && <div className="text-sm text-tertiary">Inga integrationer</div>}
            <div className="flex flex-col gap-sm">
              {integrations.map((integ) => {
                const isSource = integ.sourceSystemId === system.id;
                const otherSystem = isSource
                  ? getSystemName(integ.targetSystemId)
                  : getSystemName(integ.sourceSystemId);
                return (
                  <div key={integ.id} className="card" style={{ padding: 'var(--space-md)' }}>
                    <div className="flex items-center justify-between mb-md">
                      <div className="flex items-center gap-sm">
                        <span className={`badge badge-${integ.type.toLowerCase()}`}>{integ.type}</span>
                        <span className="text-xs text-tertiary">{integ.protocol}</span>
                      </div>
                      <button className="btn btn-sm btn-ghost" style={{ opacity: 0.5, padding: 2 }} onClick={() => handleDeleteIntegration(integ.id)}><Trash2 size={10} /></button>
                    </div>
                    <div className="flex items-center gap-sm text-sm">
                      <span>{isSource ? system.name : otherSystem}</span>
                      <ArrowRight size={12} style={{ color: 'var(--accent-cyan)' }} />
                      <span>{isSource ? otherSystem : system.name}</span>
                    </div>
                    <div className="flex items-center gap-sm mt-md">
                      <span className="text-xs text-tertiary">Frekvens: {integ.frequency}</span>
                      <span className={`badge badge-${integ.status}`} style={{ fontSize: '9px' }}>{integ.status}</span>
                    </div>
                    {integ.description && (
                      <div className="text-xs text-secondary" style={{ marginTop: 8 }}>{integ.description}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'data' && (
          <div className="detail-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
              <span className="text-sm text-secondary">{dataEntities.length} datapunkt(er)</span>
              <button className="btn btn-sm btn-primary" onClick={() => setShowAddData(!showAddData)}><Plus size={12} /> Ny datapunkt</button>
            </div>

            {showAddData && (
              <div className="card" style={{ padding: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                <input className="form-input" placeholder="Namn (t.ex. Kund, Order) *" value={newData.name} onChange={(e) => setNewData({ ...newData, name: e.target.value })} style={{ marginBottom: 8 }} />
                <div className="form-row" style={{ marginBottom: 8 }}>
                  <select className="form-select" value={newData.type} onChange={(e) => setNewData({ ...newData, type: e.target.value })}>
                    <option value="table">Tabell</option>
                    <option value="view">Vy</option>
                    <option value="topic">Topic</option>
                    <option value="file">Fil</option>
                    <option value="api">API-resurs</option>
                  </select>
                  <select className="form-select" value={newData.classification} onChange={(e) => setNewData({ ...newData, classification: e.target.value })}>
                    <option value="public">Public</option>
                    <option value="internal">Internal</option>
                    <option value="confidential">Confidential</option>
                    <option value="restricted">Restricted</option>
                  </select>
                </div>
                <input className="form-input" placeholder="Beskrivning" value={newData.description} onChange={(e) => setNewData({ ...newData, description: e.target.value })} style={{ marginBottom: 8 }} />
                <div className="flex gap-xs">
                  <button className="btn btn-sm btn-primary" onClick={handleAddData}>Lägg till</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setShowAddData(false)}>Avbryt</button>
                </div>
              </div>
            )}

            {dataEntities.length === 0 && !showAddData && <div className="text-sm text-tertiary">Inga datapunkter registrerade</div>}
            <div className="flex flex-col gap-sm">
              {dataEntities.map((de) => {
                const cc = classificationColors[de.classification] || classificationColors.internal;
                return (
                  <div key={de.id} className="card" style={{ padding: 'var(--space-md)' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-sm">
                        <Database size={14} style={{ color: 'var(--accent-cyan)' }} />
                        <span className="text-sm font-semibold">{de.name}</span>
                      </div>
                      <div className="flex items-center gap-xs">
                        <span className="badge badge-active" style={{ fontSize: '9px' }}>{de.type}</span>
                        <button className="btn btn-sm btn-ghost" style={{ opacity: 0.5, padding: 2 }} onClick={() => handleDeleteData(de.id)}><Trash2 size={10} /></button>
                      </div>
                    </div>
                    {de.description && <div className="text-xs text-secondary" style={{ marginTop: 4 }}>{de.description}</div>}
                    <div style={{ marginTop: 6 }}>
                      <span style={{
                        fontSize: '9px', padding: '1px 6px', borderRadius: 'var(--radius-full)',
                        background: cc.bg, border: `1px solid ${cc.border}`, color: cc.color,
                      }}>
                        {de.classification}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="detail-section">
            <div className="annotation-input" style={{ marginBottom: 'var(--space-lg)' }}>
              <input
                className="form-input"
                placeholder="Skriv en anteckning..."
                value={newAnnotation}
                onChange={(e) => setNewAnnotation(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddAnnotation()}
              />
              <button className="btn btn-primary btn-sm" onClick={handleAddAnnotation}>
                <Send size={12} />
              </button>
            </div>
            <div className="annotation-list">
              {annotations.map((a) => (
                <div key={a.id} className="annotation-item">
                  <div className="annotation-header">
                    <span className="annotation-author">{a.author}</span>
                    <span className="annotation-time">
                      {new Date(a.createdAt).toLocaleDateString('sv-SE')}
                    </span>
                  </div>
                  <div className="annotation-content">{a.content}</div>
                </div>
              ))}
              {annotations.length === 0 && (
                <div className="text-sm text-tertiary" style={{ textAlign: 'center', padding: 'var(--space-lg)' }}>
                  Inga anteckningar ännu
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
