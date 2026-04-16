import { Handle, Position } from '@xyflow/react';
import { Users, Building, Database, Cloud, Zap, BarChart2, CreditCard, Target, ShoppingCart, Monitor, Layers } from 'lucide-react';

const iconMap = {
  'users': Users,
  'building': Building,
  'database': Database,
  'cloud': Cloud,
  'zap': Zap,
  'bar-chart-2': BarChart2,
  'credit-card': CreditCard,
  'target': Target,
  'shopping-cart': ShoppingCart,
  'monitor': Monitor,
};

const statusLabels = {
  current: 'Aktiv',
  target: 'Målbild',
  planned: 'Planerad',
  deprecated: 'Avvecklad',
};

const layerLabels = {
  source: 'Källa',
  integration: 'Integration',
  dwh: 'DWH',
  mart: 'Mart',
  presentation: 'BI',
  consumer: 'Konsument',
};

const layerColors = {
  source: '#3b82f6',
  integration: '#a855f7',
  dwh: '#f59e0b',
  mart: '#14b8a6',
  presentation: '#ff6b35',
  consumer: '#10b981',
};

export default function SystemNode({ data, selected }) {
  const Icon = iconMap[data.icon] || Monitor;

  return (
    <div className={`system-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} style={{ background: data.color || '#ff6b35', border: 'none', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} style={{ background: data.color || '#ff6b35', border: 'none', width: 8, height: 8 }} />
      <Handle type="target" position={Position.Top} id="top" style={{ background: data.color || '#ff6b35', border: 'none', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: data.color || '#ff6b35', border: 'none', width: 8, height: 8 }} />

      <div className="system-node-status">
        <span className={`badge badge-${data.status}`} style={{ fontSize: '9px', padding: '0 5px' }}>
          {statusLabels[data.status] || data.status}
        </span>
      </div>

      <div className="system-node-header">
        <div
          className="system-node-icon"
          style={{
            background: `${data.color || '#ff6b35'}20`,
            color: data.color || '#ff6b35',
          }}
        >
          <Icon size={16} />
        </div>
        <div>
          <div className="system-node-name">{data.name}</div>
          <div className="system-node-type">{data.type}</div>
        </div>
      </div>

      {/* Layer badge in layers mode */}
      {data.layerMode && data.layer && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          marginTop: 4,
          fontSize: '9px',
          fontWeight: 600,
          color: layerColors[data.layer],
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          <Layers size={9} />
          {layerLabels[data.layer]}
        </div>
      )}

      {data.area && (
        <div className="system-node-area-bar" style={{ background: data.area.color }} />
      )}
    </div>
  );
}
