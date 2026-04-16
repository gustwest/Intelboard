import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Panel,
} from '@xyflow/react';
import { useEffect } from 'react';
import { GitBranch, Filter } from 'lucide-react';

function DataEntityNode({ data }) {
  return (
    <div style={{
      background: 'var(--glass-bg)',
      backdropFilter: 'var(--glass-blur)',
      border: `1px solid ${data.highlighted ? 'var(--accent-cyan)' : 'var(--glass-border)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '12px 16px',
      minWidth: 140,
      boxShadow: data.highlighted ? 'var(--shadow-glow-cyan)' : 'none',
      transition: 'all 0.2s',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
        {data.systemName}
      </div>
      <div style={{ fontSize: 'var(--font-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
        {data.entityName}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 9,
          padding: '1px 6px',
          borderRadius: 'var(--radius-full)',
          background: data.classification === 'restricted' ? 'rgba(239, 68, 68, 0.1)' :
            data.classification === 'confidential' ? 'rgba(245, 158, 11, 0.1)' :
            data.classification === 'internal' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
          border: `1px solid ${data.classification === 'restricted' ? 'rgba(239, 68, 68, 0.3)' :
            data.classification === 'confidential' ? 'rgba(245, 158, 11, 0.3)' :
            data.classification === 'internal' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
          color: data.classification === 'restricted' ? 'var(--accent-red)' :
            data.classification === 'confidential' ? 'var(--accent-amber)' :
            data.classification === 'internal' ? 'var(--accent-blue)' : 'var(--accent-green)',
        }}>
          {data.classification}
        </span>
        <span style={{
          fontSize: 9,
          padding: '1px 6px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(124, 58, 237, 0.1)',
          border: '1px solid rgba(124, 58, 237, 0.3)',
          color: 'var(--accent-purple-light)',
        }}>
          {data.type}
        </span>
      </div>
    </div>
  );
}

const nodeTypes = { dataEntity: DataEntityNode };

export default function DataFlowView() {
  const systems = useLiveQuery(() => db.systems.toArray(), []) || [];
  const integrations = useLiveQuery(() => db.integrations.toArray(), []) || [];
  const dataEntities = useLiveQuery(() => db.dataEntities.toArray(), []) || [];
  const [selectedEntity, setSelectedEntity] = useState(null);

  const systemMap = useMemo(() => {
    const m = {};
    systems.forEach(s => m[s.id] = s);
    return m;
  }, [systems]);

  // Build a graph: for each data entity, show it on its owning system,
  // then show which integrations carry data from that system to others
  const { flowNodes, flowEdges } = useMemo(() => {
    const nodes = [];
    const edges = [];

    // Group data entities by system
    const entitiesBySystem = {};
    dataEntities.forEach(de => {
      if (!entitiesBySystem[de.systemId]) entitiesBySystem[de.systemId] = [];
      entitiesBySystem[de.systemId].push(de);
    });

    // Layout systems horizontally, each data entity vertically under its system
    const systemsWithData = systems.filter(s => entitiesBySystem[s.id]);
    const spacing = 260;
    
    systemsWithData.forEach((sys, sysIdx) => {
      const entities = entitiesBySystem[sys.id] || [];
      entities.forEach((de, deIdx) => {
        const highlighted = selectedEntity === null || selectedEntity === de.id;
        nodes.push({
          id: `de-${de.id}`,
          type: 'dataEntity',
          position: { x: sysIdx * spacing + 50, y: deIdx * 110 + 80 },
          data: {
            entityName: de.name,
            systemName: sys.name,
            type: de.type,
            classification: de.classification,
            highlighted,
          },
        });
      });
    });

    // Draw edges for integrations between systems that have data entities
    integrations.forEach(integ => {
      const sourceEntities = entitiesBySystem[integ.sourceSystemId] || [];
      const targetEntities = entitiesBySystem[integ.targetSystemId] || [];

      if (sourceEntities.length > 0 && targetEntities.length > 0) {
        // Connect first entity of source to first entity of target
        sourceEntities.forEach(se => {
          targetEntities.forEach(te => {
            const isHighlighted = selectedEntity === null || selectedEntity === se.id || selectedEntity === te.id;
            edges.push({
              id: `flow-${integ.id}-${se.id}-${te.id}`,
              source: `de-${se.id}`,
              target: `de-${te.id}`,
              animated: isHighlighted,
              style: {
                stroke: isHighlighted ? 'var(--accent-cyan)' : 'rgba(100,100,150,0.2)',
                strokeWidth: isHighlighted ? 2 : 1,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 12,
                height: 12,
                color: isHighlighted ? '#00d4ff' : 'rgba(100,100,150,0.3)',
              },
            });
          });
        });
      }
    });

    return { flowNodes: nodes, flowEdges: edges };
  }, [systems, integrations, dataEntities, selectedEntity, systemMap]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--border-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-xl)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <GitBranch size={22} style={{ color: 'var(--accent-cyan)' }} />
            Dataflöden
          </h1>
          <p className="text-sm text-secondary" style={{ marginTop: 4 }}>
            Visualiserar hur datapunkter flödar genom systemen. Klicka på en datapunkt för att markera dess flöde.
          </p>
        </div>
        <div className="flex gap-sm items-center">
          <select
            className="form-select"
            style={{ width: 200 }}
            value={selectedEntity || ''}
            onChange={(e) => setSelectedEntity(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Alla datapunkter</option>
            {dataEntities.map(de => (
              <option key={de.id} value={de.id}>{de.name} ({systemMap[de.systemId]?.name})</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ flex: 1 }}>
        {dataEntities.length === 0 ? (
          <div className="empty-state" style={{ height: '100%' }}>
            <GitBranch size={48} className="empty-state-icon" />
            <div className="empty-state-text">Inga datapunkter registrerade ännu. Lägg till datapunkter på system för att se flöden.</div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_e, node) => {
              const deId = Number(node.id.replace('de-', ''));
              setSelectedEntity(selectedEntity === deId ? null : deId);
            }}
          >
            <Background color="rgba(0, 212, 255, 0.05)" gap={24} size={1} />
            <Controls position="bottom-right" />
            <Panel position="top-right" style={{ margin: 12 }}>
              <div className="flex gap-md items-center" style={{ fontSize: '10px' }}>
                {['public', 'internal', 'confidential', 'restricted'].map(c => (
                  <div key={c} className="flex items-center gap-xs">
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: c === 'restricted' ? 'var(--accent-red)' : c === 'confidential' ? 'var(--accent-amber)' : c === 'internal' ? 'var(--accent-blue)' : 'var(--accent-green)',
                    }} />
                    <span style={{ color: 'var(--text-tertiary)' }}>{c}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
