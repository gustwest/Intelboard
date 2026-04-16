import { useState } from 'react';
import { X } from 'lucide-react';
import { db } from '../db';

export default function CreateSystemModal({ managementAreas, onClose }) {
  const [formData, setFormData] = useState({
    name: '',
    type: 'application',
    status: 'current',
    description: '',
    managementAreaId: managementAreas[0]?.id || null,
    color: '#7c3aed',
    icon: 'monitor',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    await db.systems.add({
      ...formData,
      managementAreaId: Number(formData.managementAreaId),
      position: { x: 200 + Math.random() * 300, y: 200 + Math.random() * 200 },
    });
    onClose();
  };

  const update = (key, value) => setFormData({ ...formData, [key]: value });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Skapa nytt system</h2>
          <button className="detail-panel-close" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Systemnamn *</label>
              <input className="form-input" value={formData.name} onChange={(e) => update('name', e.target.value)} placeholder="T.ex. SAP ERP, Kafka, etc." autoFocus />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Typ</label>
                <select className="form-select" value={formData.type} onChange={(e) => update('type', e.target.value)}>
                  <option value="application">Applikation</option>
                  <option value="service">Tjänst</option>
                  <option value="database">Databas</option>
                  <option value="platform">Plattform</option>
                  <option value="external">Extern</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-select" value={formData.status} onChange={(e) => update('status', e.target.value)}>
                  <option value="current">Aktiv (nuläge)</option>
                  <option value="target">Målbild</option>
                  <option value="planned">Planerad</option>
                  <option value="deprecated">Avvecklas</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Förvaltningsområde</label>
              <select className="form-select" value={formData.managementAreaId || ''} onChange={(e) => update('managementAreaId', e.target.value)}>
                <option value="">— Inget —</option>
                {managementAreas.map((area) => (
                  <option key={area.id} value={area.id}>{area.name}</option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Färg</label>
                <div className="flex gap-sm flex-wrap">
                  {['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#8b5cf6'].map((c) => (
                    <div
                      key={c}
                      onClick={() => update('color', c)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 'var(--radius-sm)',
                        background: c,
                        cursor: 'pointer',
                        border: formData.color === c ? '2px solid white' : '2px solid transparent',
                        transition: 'all 0.15s',
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Ikon</label>
                <select className="form-select" value={formData.icon} onChange={(e) => update('icon', e.target.value)}>
                  <option value="monitor">Monitor</option>
                  <option value="database">Databas</option>
                  <option value="users">Användare</option>
                  <option value="building">Byggnad</option>
                  <option value="cloud">Moln</option>
                  <option value="zap">Blixt</option>
                  <option value="shopping-cart">Kundvagn</option>
                  <option value="credit-card">Betalkort</option>
                  <option value="target">Mål</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Beskrivning</label>
              <textarea className="form-textarea" value={formData.description} onChange={(e) => update('description', e.target.value)} placeholder="Beskriv systemets syfte och funktion..." />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>Avbryt</button>
            <button type="submit" className="btn btn-primary">Skapa system</button>
          </div>
        </form>
      </div>
    </div>
  );
}
