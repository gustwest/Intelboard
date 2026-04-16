import { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Panel,
  useReactFlow,
} from '@xyflow/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Layers, Shuffle, ArrowRightLeft } from 'lucide-react';
import SystemNode from '../components/SystemNode';
import IntegrationEdge from '../components/IntegrationEdge';
import SystemDetailPanel from '../components/SystemDetailPanel';
import CreateSystemModal from '../components/CreateSystemModal';

const nodeTypes = { system: SystemNode };
const edgeTypes = { integration: IntegrationEdge };

const integrationColors = {
  API: '#3b82f6',
  Event: '#a855f7',
  Batch: '#f59e0b',
  File: '#10b981',
  Database: '#06b6d4',
  Manual: '#6b7280',
};

// ========================================
// Layer classification logic
// ========================================
const LAYERS = [
  { id: 'source', label: 'Källsystem', color: 'rgba(59,130,246,0.06)' },
  { id: 'integration', label: 'Integrationslager', color: 'rgba(168,85,247,0.06)' },
  { id: 'dwh', label: 'Data Warehouse', color: 'rgba(245,158,11,0.06)' },
  { id: 'mart', label: 'Dataprodukt / Mart', color: 'rgba(20,184,166,0.06)' },
  { id: 'presentation', label: 'Presentation', color: 'rgba(255,107,53,0.06)' },
  { id: 'consumer', label: 'Konsumenter', color: 'rgba(16,185,129,0.06)' },
];

function classifySystemToLayer(system, integrations, allSystems) {
  const name = (system.name || '').toLowerCase();
  const type = (system.type || '').toLowerCase();
  const desc = (system.description || '').toLowerCase();

  // Explicit type matches
  if (type === 'external') return 'source';
  if (name.includes('kafka') || name.includes('mq') || name.includes('event bus') || name.includes('tibco') || name.includes('mulesoft') || name.includes('biztalk')) return 'integration';
  if (name.includes('dwh') || name.includes('warehouse') || name.includes('snowflake') || name.includes('bigquery') || name.includes('redshift') || name.includes('datalake')) return 'dwh';
  if (name.includes('mart') || name.includes('dataprodukt') || name.includes('mdm') || name.includes('master data')) return 'mart';
  if (name.includes('power bi') || name.includes('tableau') || name.includes('looker') || name.includes('grafana') || name.includes('qlik') || type === 'dashboard') return 'presentation';

  // Heuristic: check integration patterns
  const outgoing = integrations.filter(i => i.sourceSystemId === system.id);
  const incoming = integrations.filter(i => i.targetSystemId === system.id);

  // Pure consumers (only incoming, no outgoing to non-presentation systems)
  if (incoming.length > 0 && outgoing.length === 0) return 'consumer';

  // Pure sources (only outgoing)
  if (outgoing.length > 0 && incoming.length === 0) return 'source';

  // Has bidirectional connections → likely a core application / source system
  const hasBidir = integrations.some(i =>
    (i.sourceSystemId === system.id || i.targetSystemId === system.id) && i.direction === 'bidirectional'
  );
  if (hasBidir) return 'source';

  // Default: source (operational systems)
  if (type === 'application') return 'source';
  if (type === 'platform') return 'integration';
  if (type === 'database') return 'dwh';

  return 'source';
}

function computeLayerPositions(systems, integrations) {
  const layered = {};
  LAYERS.forEach(l => { layered[l.id] = []; });

  systems.forEach(sys => {
    const layer = classifySystemToLayer(sys, integrations, systems);
    layered[layer].push(sys);
  });

  const LAYER_WIDTH = 250;
  const NODE_HEIGHT = 100;
  const PADDING_TOP = 70;
  const PADDING_LEFT = 40;
  const GAP_Y = 30;

  const positions = {};
  LAYERS.forEach((layer, layerIdx) => {
    const sysList = layered[layer.id];
    const x = PADDING_LEFT + layerIdx * LAYER_WIDTH;
    sysList.forEach((sys, sysIdx) => {
      const y = PADDING_TOP + sysIdx * (NODE_HEIGHT + GAP_Y);
      positions[sys.id] = { x, y };
    });
  });

  return { positions, layered };
}

function CanvasInner({
  selectedSystem,
  onSelectSystem,
  selectedIntegration,
  onSelectIntegration,
  showCreateSystem,
  onCloseCreateSystem,
}) {
  const [layoutMode, setLayoutMode] = useState('free'); // 'free' or 'layers'
  const { fitView } = useReactFlow();

  const systems = useLiveQuery(() => db.systems.toArray(), []) || [];
  const integrations = useLiveQuery(() => db.integrations.toArray(), []) || [];
  const managementAreas = useLiveQuery(() => db.managementAreas.toArray(), []) || [];
  const owners = useLiveQuery(() => db.owners.toArray(), []) || [];
  const dataEntities = useLiveQuery(() => db.dataEntities.toArray(), []) || [];

  const areaMap = useMemo(() => {
    const m = {};
    managementAreas.forEach((a) => (m[a.id] = a));
    return m;
  }, [managementAreas]);

  // Layer computation
  const { positions: layerPositions, layered } = useMemo(
    () => computeLayerPositions(systems, integrations),
    [systems, integrations]
  );

  const nodes = useMemo(() => {
    return systems.map((sys) => {
      const pos = layoutMode === 'layers'
        ? (layerPositions[sys.id] || { x: 0, y: 0 })
        : (sys.position || { x: Math.random() * 600, y: Math.random() * 400 });

      return {
        id: String(sys.id),
        type: 'system',
        position: pos,
        draggable: layoutMode !== 'layers',
        data: {
          ...sys,
          area: areaMap[sys.managementAreaId],
          selected: selectedSystem === sys.id,
          layerMode: layoutMode === 'layers',
          layer: layoutMode === 'layers' ? classifySystemToLayer(sys, integrations, systems) : null,
        },
      };
    });
  }, [systems, areaMap, selectedSystem, layoutMode, layerPositions, integrations]);

  const edges = useMemo(() => {
    return integrations.map((integ) => {
      const isBidir = integ.direction === 'bidirectional';
      return {
        id: `e-${integ.id}`,
        source: String(integ.sourceSystemId),
        target: String(integ.targetSystemId),
        type: 'integration',
        animated: integ.status === 'active',
        data: { ...integ, isBidir },
        style: {
          stroke: integrationColors[integ.type] || '#6b7280',
          strokeWidth: 2,
          strokeDasharray: integ.status === 'planned' ? '6 3' : 'none',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: integrationColors[integ.type] || '#6b7280',
        },
        ...(isBidir ? {
          markerStart: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
            color: integrationColors[integ.type] || '#6b7280',
          },
        } : {}),
      };
    });
  }, [integrations]);

  const onNodeDragStop = useCallback(async (_event, node) => {
    if (layoutMode === 'free') {
      await db.systems.update(Number(node.id), { position: node.position });
    }
  }, [layoutMode]);

  const onNodeClick = useCallback((_event, node) => {
    onSelectSystem(Number(node.id));
  }, [onSelectSystem]);

  const onEdgeClick = useCallback((_event, edge) => {
    const integId = Number(edge.id.replace('e-', ''));
    onSelectIntegration(integId);
  }, [onSelectIntegration]);

  const onPaneClick = useCallback(() => {
    onSelectSystem(null);
    onSelectIntegration(null);
  }, [onSelectSystem, onSelectIntegration]);

  // Toggle layout mode
  const handleToggleLayout = (mode) => {
    setLayoutMode(mode);
    setTimeout(() => fitView({ padding: 0.15, duration: 500 }), 100);
  };

  const selectedSystemData = systems.find((s) => s.id === selectedSystem);
  const systemOwners = owners.filter((o) => o.systemId === selectedSystem);
  const systemDataEntities = dataEntities.filter((d) => d.systemId === selectedSystem);
  const systemIntegrations = integrations.filter(
    (i) => i.sourceSystemId === selectedSystem || i.targetSystemId === selectedSystem
  );

  if (systems.length === 0) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
        Laddar arkitekturvy...
      </div>
    );
  }

  // Layer background columns for layers mode
  const LAYER_WIDTH = 250;
  const PADDING_LEFT = 40;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(255, 107, 53, 0.04)" gap={24} size={1} />
        <Controls position="bottom-right" />
        <MiniMap
          position="bottom-left"
          nodeColor={(n) => n.data?.color || '#ff6b35'}
          maskColor="rgba(12, 12, 20, 0.85)"
          style={{ width: 180, height: 120 }}
        />

        {/* Top-left: Legend + Layout toggle */}
        <Panel position="top-left" style={{ margin: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Layout Toggle */}
            <div className="layout-toggle-group">
              <button
                className={`layout-toggle-btn ${layoutMode === 'free' ? 'active' : ''}`}
                onClick={() => handleToggleLayout('free')}
              >
                <Shuffle size={12} /> Fri
              </button>
              <button
                className={`layout-toggle-btn ${layoutMode === 'layers' ? 'active' : ''}`}
                onClick={() => handleToggleLayout('layers')}
              >
                <Layers size={12} /> Lager
              </button>
            </div>

            {/* Integration Legend */}
            <div className="flex gap-sm flex-wrap">
              {Object.entries(integrationColors).map(([type, color]) => (
                <div key={type} className="flex items-center gap-xs" style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                  <div style={{ width: 12, height: 3, background: color, borderRadius: 2 }} />
                  {type}
                </div>
              ))}
              <div className="flex items-center gap-xs" style={{ fontSize: '10px', color: 'var(--accent-cyan)' }}>
                <ArrowRightLeft size={10} /> Bidir
              </div>
            </div>

            {/* Layer labels when in layers mode */}
            {layoutMode === 'layers' && (
              <div style={{ display: 'flex', gap: 0, marginTop: 4 }}>
                {LAYERS.map((layer, idx) => {
                  const count = layered[layer.id]?.length || 0;
                  if (count === 0) return null;
                  return (
                    <div key={layer.id} style={{
                      width: LAYER_WIDTH,
                      textAlign: 'center',
                      fontSize: '9px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      color: 'var(--text-tertiary)',
                      padding: '4px 0',
                      borderBottom: `2px solid ${layer.color.replace('0.06', '0.3')}`,
                      background: layer.color,
                      borderRadius: idx === 0 ? 'var(--radius-sm) 0 0 0' : idx === LAYERS.length - 1 ? '0 var(--radius-sm) 0 0' : 0,
                    }}>
                      {layer.label}
                      <span style={{ marginLeft: 4, opacity: 0.6 }}>({count})</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Panel>
      </ReactFlow>

      {/* System Detail Panel */}
      {selectedSystem && selectedSystemData && (
        <>
          <div
            className={`detail-panel-overlay ${selectedSystem ? 'open' : ''}`}
            onClick={() => onSelectSystem(null)}
          />
          <SystemDetailPanel
            system={selectedSystemData}
            area={areaMap[selectedSystemData.managementAreaId]}
            owners={systemOwners}
            dataEntities={systemDataEntities}
            integrations={systemIntegrations}
            allSystems={systems}
            onClose={() => onSelectSystem(null)}
          />
        </>
      )}

      {/* Create System Modal */}
      {showCreateSystem && (
        <CreateSystemModal
          managementAreas={managementAreas}
          onClose={onCloseCreateSystem}
        />
      )}
    </div>
  );
}

export default function ArchitectureCanvas(props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
