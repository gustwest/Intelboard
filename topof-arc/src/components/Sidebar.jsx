import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Users, Building, Database, Cloud, Zap, BarChart2, CreditCard, Target, ShoppingCart, Monitor, Filter } from 'lucide-react';
import { useState } from 'react';

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

function getIcon(iconName, size = 14) {
  const Icon = iconMap[iconName] || Monitor;
  return <Icon size={size} />;
}

export default function Sidebar({ systems, managementAreas, selectedSystem, onSelectSystem, searchQuery }) {
  const [filterArea, setFilterArea] = useState(null);
  const [filterStatus, setFilterStatus] = useState(null);

  const filteredSystems = systems.filter((s) => {
    if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterArea && s.managementAreaId !== filterArea) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    return true;
  });

  const groupedByArea = managementAreas.map((area) => ({
    ...area,
    systems: filteredSystems.filter((s) => s.managementAreaId === area.id),
  })).filter(group => group.systems.length > 0);

  const ungrouped = filteredSystems.filter(s => !s.managementAreaId);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">System</span>
        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)' }}>
          {filteredSystems.length} st
        </span>
      </div>

      {/* Filters */}
      <div style={{ padding: 'var(--space-sm)', borderBottom: '1px solid var(--border-secondary)' }}>
        <div className="flex gap-xs flex-wrap">
          <button
            className={`btn btn-sm ${!filterStatus ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilterStatus(null)}
            style={{ fontSize: '10px', padding: '2px 8px' }}
          >
            Alla
          </button>
          {['current', 'target', 'planned', 'deprecated'].map((status) => (
            <button
              key={status}
              className={`btn btn-sm ${filterStatus === status ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilterStatus(filterStatus === status ? null : status)}
              style={{ fontSize: '10px', padding: '2px 8px' }}
            >
              {status === 'current' ? 'Aktiv' : status === 'target' ? 'Målbild' : status === 'planned' ? 'Planerad' : 'Avvecklad'}
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-content">
        {groupedByArea.map((group) => (
          <div key={group.id} className="sidebar-section">
            <div className="sidebar-section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: group.color,
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              {group.name}
            </div>
            {group.systems.map((system) => (
              <div
                key={system.id}
                className={`sidebar-item ${selectedSystem === system.id ? 'active' : ''}`}
                onClick={() => onSelectSystem(selectedSystem === system.id ? null : system.id)}
              >
                <div
                  className="system-node-icon"
                  style={{
                    background: `${system.color}20`,
                    color: system.color,
                    width: 28,
                    height: 28,
                  }}
                >
                  {getIcon(system.icon, 13)}
                </div>
                <span className="sidebar-item-name">{system.name}</span>
                <span className={`badge badge-${system.status}`} style={{ fontSize: '9px', padding: '0 5px' }}>
                  {system.status === 'current' ? 'Aktiv' : system.status === 'target' ? 'Målbild' : system.status === 'planned' ? 'Planerad' : 'Avveckl.'}
                </span>
              </div>
            ))}
          </div>
        ))}

        {ungrouped.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">Övrigt</div>
            {ungrouped.map((system) => (
              <div
                key={system.id}
                className={`sidebar-item ${selectedSystem === system.id ? 'active' : ''}`}
                onClick={() => onSelectSystem(selectedSystem === system.id ? null : system.id)}
              >
                <div
                  className="system-node-icon"
                  style={{ background: `${system.color || '#666'}20`, color: system.color || '#666', width: 28, height: 28 }}
                >
                  {getIcon(system.icon, 13)}
                </div>
                <span className="sidebar-item-name">{system.name}</span>
              </div>
            ))}
          </div>
        )}

        {filteredSystems.length === 0 && (
          <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
            <Filter size={24} className="empty-state-icon" />
            <div className="text-sm text-tertiary">Inga system matchar filtret</div>
          </div>
        )}
      </div>
    </div>
  );
}
