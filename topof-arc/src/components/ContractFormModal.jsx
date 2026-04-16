import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Plus, Trash2, Eye } from 'lucide-react';
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react';
import { db } from '../db';

// Mini version of SystemNode for contract preview
function PreviewNode({ data }) {
  return (
    <div style={{
      background: 'var(--glass-bg)',
      backdropFilter: 'var(--glass-blur)',
      border: `2px solid ${data.color || 'var(--accent-purple)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '16px 20px',
      minWidth: 160,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 'var(--font-md)', fontWeight: 700, color: 'var(--text-primary)' }}>
        {data.label}
      </div>
      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', marginTop: 4 }}>
        {data.subtitle}
      </div>
    </div>
  );
}

function DataNode({ data }) {
  return (
    <div style={{
      background: 'rgba(0, 212, 255, 0.08)',
      border: '1px solid rgba(0, 212, 255, 0.3)',
      borderRadius: 'var(--radius-md)',
      padding: '6px 12px',
      fontSize: 'var(--font-xs)',
      color: 'var(--accent-cyan)',
      fontWeight: 500,
      whiteSpace: 'nowrap',
    }}>
      {data.label}
    </div>
  );
}

function OwnerNode({ data }) {
  return (
    <div style={{
      background: 'rgba(124, 58, 237, 0.08)',
      border: '1px solid rgba(124, 58, 237, 0.3)',
      borderRadius: 'var(--radius-full)',
      padding: '4px 10px',
      fontSize: '10px',
      color: 'var(--accent-purple-light)',
      display: 'flex',
      alignItems: 'center',
      gap: 4,
    }}>
      <span style={{ fontWeight: 600 }}>{data.role}:</span> {data.label}
    </div>
  );
}

function SlaNode({ data }) {
  return (
    <div style={{
      background: 'rgba(16, 185, 129, 0.08)',
      border: '1px solid rgba(16, 185, 129, 0.3)',
      borderRadius: 'var(--radius-md)',
      padding: '6px 12px',
      fontSize: '10px',
      color: 'var(--accent-green)',
      fontWeight: 500,
      maxWidth: 200,
      textAlign: 'center',
    }}>
      SLA: {data.label}
    </div>
  );
}

const previewNodeTypes = {
  preview: PreviewNode,
  dataEntity: DataNode,
  owner: OwnerNode,
  sla: SlaNode,
};

const integrationColors = {
  API: '#3b82f6',
  Event: '#7c3aed',
  Batch: '#f59e0b',
  File: '#10b981',
  Database: '#06b6d4',
  Manual: '#6b7280',
};

export default function ContractFormModal({ contract, systems, onClose }) {
  const [formData, setFormData] = useState({
    title: '',
    type: 'integration',
    status: 'draft',
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    parsedContent: {
      sourceSystem: '',
      targetSystem: '',
      integrationType: 'API',
      protocol: 'REST',
      frequency: 'realtime',
      dataEntities: [],
      sla: '',
      dataOwner: '',
      informationOwner: '',
    },
  });

  const [newDataEntity, setNewDataEntity] = useState('');

  useEffect(() => {
    if (contract) {
      setFormData({
        title: contract.title || '',
        type: contract.type || 'integration',
        status: contract.status || 'draft',
        validFrom: contract.validFrom || '',
        validTo: contract.validTo || '',
        parsedContent: contract.parsedContent || {
          sourceSystem: '',
          targetSystem: '',
          integrationType: 'API',
          protocol: 'REST',
          frequency: 'realtime',
          dataEntities: [],
          sla: '',
          dataOwner: '',
          informationOwner: '',
        },
      });
    }
  }, [contract]);

  const updateParsed = (key, value) => {
    setFormData({
      ...formData,
      parsedContent: { ...formData.parsedContent, [key]: value },
    });
  };

  const addDataEntity = () => {
    if (!newDataEntity.trim()) return;
    updateParsed('dataEntities', [...(formData.parsedContent.dataEntities || []), newDataEntity.trim()]);
    setNewDataEntity('');
  };

  const removeDataEntity = (index) => {
    const updated = [...formData.parsedContent.dataEntities];
    updated.splice(index, 1);
    updateParsed('dataEntities', updated);
  };

  // Generate preview nodes and edges from form data
  const { previewNodes, previewEdges } = useMemo(() => {
    const nodes = [];
    const edges = [];
    const pc = formData.parsedContent;

    if (!pc.sourceSystem && !pc.targetSystem) {
      return { previewNodes: [], previewEdges: [] };
    }

    const edgeColor = integrationColors[pc.integrationType] || '#6b7280';

    // Source system node
    if (pc.sourceSystem) {
      nodes.push({
        id: 'source',
        type: 'preview',
        position: { x: 50, y: 120 },
        data: { label: pc.sourceSystem, subtitle: 'Källsystem', color: '#7c3aed' },
        draggable: false,
      });
    }

    // Target system node
    if (pc.targetSystem) {
      nodes.push({
        id: 'target',
        type: 'preview',
        position: { x: 450, y: 120 },
        data: { label: pc.targetSystem, subtitle: 'Målsystem', color: '#10b981' },
        draggable: false,
      });
    }

    // Edge between source and target
    if (pc.sourceSystem && pc.targetSystem) {
      edges.push({
        id: 'e-main',
        source: 'source',
        target: 'target',
        animated: true,
        style: { stroke: edgeColor, strokeWidth: 3 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: edgeColor },
        label: `${pc.integrationType} · ${pc.protocol} · ${pc.frequency}`,
        labelStyle: { fill: 'var(--text-secondary)', fontSize: 11, fontFamily: 'var(--font-family)', fontWeight: 500 },
        labelBgStyle: { fill: 'var(--bg-secondary)', fillOpacity: 0.9 },
        labelBgPadding: [6, 4],
        labelBgBorderRadius: 4,
      });
    }

    // Data entity nodes
    const dataEntities = pc.dataEntities || [];
    dataEntities.forEach((de, i) => {
      const id = `de-${i}`;
      nodes.push({
        id,
        type: 'dataEntity',
        position: { x: 220 + (i % 3) * 80, y: 240 + Math.floor(i / 3) * 36 },
        data: { label: de },
        draggable: false,
      });
    });

    // Owner nodes
    if (pc.dataOwner) {
      nodes.push({
        id: 'owner-data',
        type: 'owner',
        position: { x: 50, y: 20 },
        data: { label: pc.dataOwner, role: 'Dataägare' },
        draggable: false,
      });
    }

    if (pc.informationOwner) {
      nodes.push({
        id: 'owner-info',
        type: 'owner',
        position: { x: 350, y: 20 },
        data: { label: pc.informationOwner, role: 'Infoägare' },
        draggable: false,
      });
    }

    // SLA node
    if (pc.sla) {
      nodes.push({
        id: 'sla',
        type: 'sla',
        position: { x: 200, y: 320 + Math.ceil(dataEntities.length / 3) * 36 },
        data: { label: pc.sla },
        draggable: false,
      });
    }

    return { previewNodes: nodes, previewEdges: edges };
  }, [formData.parsedContent]);

  const [nodes, setNodes, onNodesChange] = useNodesState(previewNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(previewEdges);

  useEffect(() => {
    setNodes(previewNodes);
    setEdges(previewEdges);
  }, [previewNodes, previewEdges, setNodes, setEdges]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const systemIds = [];
    systems.forEach((s) => {
      if (s.name === formData.parsedContent.sourceSystem || s.name === formData.parsedContent.targetSystem) {
        systemIds.push(s.id);
      }
    });

    const data = {
      ...formData,
      systemIds,
      integrationIds: [],
    };

    if (contract?.id) {
      await db.contracts.update(contract.id, data);
    } else {
      await db.contracts.add(data);
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1100, maxHeight: '92vh' }}>
        <div className="modal-header">
          <h2 className="modal-title">{contract ? 'Redigera kontrakt' : 'Nytt kontrakt'}</h2>
          <button className="detail-panel-close" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
            {/* Left: Form */}
            <div style={{ overflow: 'auto', maxHeight: '65vh' }}>
              <div className="form-group">
                <label className="form-label">Kontraktstitel *</label>
                <input className="form-input" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="T.ex. CRM → Kafka Integrationskontrakt" autoFocus />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Kontraktstyp</label>
                  <select className="form-select" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                    <option value="integration">Integrationskontrakt</option>
                    <option value="information">Informationskontrakt</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                    <option value="draft">Utkast</option>
                    <option value="active">Aktivt</option>
                    <option value="expired">Utgånget</option>
                    <option value="terminated">Avslutat</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Giltig från</label>
                  <input type="date" className="form-input" value={formData.validFrom} onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Giltig till</label>
                  <input type="date" className="form-input" value={formData.validTo} onChange={(e) => setFormData({ ...formData, validTo: e.target.value })} />
                </div>
              </div>

              <div style={{ margin: 'var(--space-lg) 0 var(--space-sm)', borderTop: '1px solid var(--border-secondary)', paddingTop: 'var(--space-md)' }}>
                <div className="form-label" style={{ fontSize: 'var(--font-sm)', marginBottom: 'var(--space-md)' }}>⚡ Integrationspunkter</div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Källsystem</label>
                  <input
                    className="form-input"
                    value={formData.parsedContent.sourceSystem}
                    onChange={(e) => updateParsed('sourceSystem', e.target.value)}
                    placeholder="T.ex. Salesforce CRM"
                    list="systems-list"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Målsystem</label>
                  <input
                    className="form-input"
                    value={formData.parsedContent.targetSystem}
                    onChange={(e) => updateParsed('targetSystem', e.target.value)}
                    placeholder="T.ex. Kafka Event Bus"
                    list="systems-list"
                  />
                </div>
              </div>
              <datalist id="systems-list">
                {systems.map((s) => <option key={s.id} value={s.name} />)}
              </datalist>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Integrationstyp</label>
                  <select className="form-select" value={formData.parsedContent.integrationType} onChange={(e) => updateParsed('integrationType', e.target.value)}>
                    <option value="API">API</option>
                    <option value="Event">Event / Message</option>
                    <option value="Batch">Batch</option>
                    <option value="File">Filöverföring</option>
                    <option value="Database">Databas</option>
                    <option value="Manual">Manuell</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Protokoll</label>
                  <select className="form-select" value={formData.parsedContent.protocol} onChange={(e) => updateParsed('protocol', e.target.value)}>
                    <option value="REST">REST</option>
                    <option value="GraphQL">GraphQL</option>
                    <option value="gRPC">gRPC</option>
                    <option value="Kafka">Kafka</option>
                    <option value="SFTP">SFTP</option>
                    <option value="JDBC">JDBC</option>
                    <option value="SOAP">SOAP</option>
                    <option value="WebSocket">WebSocket</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Frekvens</label>
                <select className="form-select" value={formData.parsedContent.frequency} onChange={(e) => updateParsed('frequency', e.target.value)}>
                  <option value="realtime">Realtid</option>
                  <option value="near-realtime">Nära realtid</option>
                  <option value="hourly">Varje timme</option>
                  <option value="daily">Dagligen</option>
                  <option value="weekly">Veckovis</option>
                  <option value="on-demand">Vid behov</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Datapunkter / Tabeller</label>
                <div className="flex gap-xs flex-wrap mb-md">
                  {(formData.parsedContent.dataEntities || []).map((de, i) => (
                    <span key={i} className="badge badge-database" style={{ cursor: 'pointer' }} onClick={() => removeDataEntity(i)}>
                      {de} ×
                    </span>
                  ))}
                </div>
                <div className="flex gap-sm">
                  <input
                    className="form-input"
                    value={newDataEntity}
                    onChange={(e) => setNewDataEntity(e.target.value)}
                    placeholder="Lägg till datapunkt..."
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDataEntity(); } }}
                  />
                  <button type="button" className="btn btn-sm" onClick={addDataEntity}><Plus size={12} /></button>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Dataägare</label>
                  <input className="form-input" value={formData.parsedContent.dataOwner || ''} onChange={(e) => updateParsed('dataOwner', e.target.value)} placeholder="Namn" />
                </div>
                <div className="form-group">
                  <label className="form-label">Informationsägare</label>
                  <input className="form-input" value={formData.parsedContent.informationOwner || ''} onChange={(e) => updateParsed('informationOwner', e.target.value)} placeholder="Namn" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">SLA</label>
                <input className="form-input" value={formData.parsedContent.sla || ''} onChange={(e) => updateParsed('sla', e.target.value)} placeholder="T.ex. 99.9% uptime, max 500ms latency" />
              </div>
            </div>

            {/* Right: Live Visual Preview */}
            <div>
              <div className="contract-preview" style={{ height: '100%' }}>
                <div className="contract-preview-title">
                  <Eye size={12} /> Live visuell preview
                </div>
                {previewNodes.length === 0 ? (
                  <div className="contract-preview-empty">
                    Fyll i käll- och målsystem för att se diagrammet
                  </div>
                ) : (
                  <div style={{ height: 'calc(100% - 30px)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <ReactFlow
                      nodes={nodes}
                      edges={edges}
                      onNodesChange={onNodesChange}
                      onEdgesChange={onEdgesChange}
                      nodeTypes={previewNodeTypes}
                      fitView
                      proOptions={{ hideAttribution: true }}
                      panOnDrag={false}
                      zoomOnScroll={false}
                      preventScrolling={false}
                      nodesDraggable={false}
                    >
                      <Background color="rgba(0, 212, 255, 0.05)" gap={20} size={1} />
                    </ReactFlow>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>Avbryt</button>
            <button type="submit" className="btn btn-primary">{contract ? 'Uppdatera' : 'Skapa kontrakt'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
