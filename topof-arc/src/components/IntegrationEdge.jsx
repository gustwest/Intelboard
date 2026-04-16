import { BaseEdge, getBezierPath, EdgeLabelRenderer } from '@xyflow/react';
import { ArrowRightLeft } from 'lucide-react';

const typeIcons = {
  API: '⚡',
  Event: '📡',
  Batch: '📦',
  File: '📄',
  Database: '🗄️',
  Manual: '👤',
};

const freqLabels = {
  realtime: 'RT',
  'near-realtime': '~RT',
  hourly: '1h',
  daily: '24h',
  weekly: '7d',
  'on-demand': 'OD',
};

export default function IntegrationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
  markerStart,
}) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const isBidir = data?.isBidir || data?.direction === 'bidirectional';

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} markerStart={markerStart} />
      <EdgeLabelRenderer>
        <div
          className="integration-edge-label"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <span>{typeIcons[data?.type] || '🔗'}</span>
          <span>{data?.type}</span>
          <span style={{ color: 'var(--text-tertiary)' }}>•</span>
          <span>{freqLabels[data?.frequency] || data?.frequency}</span>
          {isBidir && (
            <span className="bidir-indicator" title="Bidirektionell">
              <ArrowRightLeft size={8} /> ↔
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
