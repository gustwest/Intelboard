import { useEffect, useState, useRef, useMemo } from 'react';
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Map, GitBranch, Calendar, FileText, Search, Plus, X, Download, Upload } from 'lucide-react';
import { seedDatabase, resetAndReseed, db } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import ArchitectureCanvas from './views/ArchitectureCanvas';
import DataFlowView from './views/DataFlowView';
import ReleasePlanning from './views/ReleasePlanning';
import ContractManager from './views/ContractManager';
import Sidebar from './components/Sidebar';

export default function App() {
  const [ready, setReady] = useState(false);
  const [selectedSystem, setSelectedSystem] = useState(null);
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [showCreateSystem, setShowCreateSystem] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const init = async () => {
      const systemCount = await db.systems.count();
      const areaCount = await db.managementAreas.count();
      if (systemCount > 10 || (systemCount > 0 && areaCount > 4)) {
        await resetAndReseed();
      } else if (systemCount === 0) {
        await seedDatabase();
      }
      setReady(true);
    };
    init();
  }, []);

  const systems = useLiveQuery(() => db.systems.toArray(), []) || [];
  const managementAreas = useLiveQuery(() => db.managementAreas.toArray(), []) || [];
  const integrations = useLiveQuery(() => db.integrations.toArray(), []) || [];
  const contracts = useLiveQuery(() => db.contracts.toArray(), []) || [];
  const owners = useLiveQuery(() => db.owners.toArray(), []) || [];

  // Global search results
  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    const results = [];

    systems.forEach(s => {
      if (s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q)) {
        results.push({ type: 'system', id: s.id, name: s.name, subtitle: s.type, color: s.color });
      }
    });
    integrations.forEach(i => {
      const src = systems.find(s => s.id === i.sourceSystemId)?.name || '';
      const tgt = systems.find(s => s.id === i.targetSystemId)?.name || '';
      const desc = i.description || '';
      if (src.toLowerCase().includes(q) || tgt.toLowerCase().includes(q) || desc.toLowerCase().includes(q)) {
        results.push({ type: 'integration', id: i.id, name: `${src} → ${tgt}`, subtitle: `${i.type} · ${i.protocol}`, color: null });
      }
    });
    contracts.forEach(c => {
      if (c.title.toLowerCase().includes(q)) {
        results.push({ type: 'contract', id: c.id, name: c.title, subtitle: c.status, color: null });
      }
    });
    owners.forEach(o => {
      if (o.name.toLowerCase().includes(q) || o.email?.toLowerCase().includes(q)) {
        const sys = systems.find(s => s.id === o.systemId);
        results.push({ type: 'owner', id: o.id, name: o.name, subtitle: `${o.role} · ${sys?.name || ''}`, color: null });
      }
    });

    return results.slice(0, 8);
  }, [searchQuery, systems, integrations, contracts, owners]);

  const handleSearchSelect = (result) => {
    setSearchQuery('');
    setSearchFocused(false);
    if (result.type === 'system') {
      navigate('/');
      setTimeout(() => setSelectedSystem(result.id), 100);
    } else if (result.type === 'contract') {
      navigate('/contracts');
    } else if (result.type === 'integration') {
      navigate('/');
    } else if (result.type === 'owner') {
      const owner = owners.find(o => o.id === result.id);
      if (owner) {
        navigate('/');
        setTimeout(() => setSelectedSystem(owner.systemId), 100);
      }
    }
  };

  // Export database
  const handleExport = async () => {
    const data = {
      systems: await db.systems.toArray(),
      integrations: await db.integrations.toArray(),
      dataEntities: await db.dataEntities.toArray(),
      owners: await db.owners.toArray(),
      managementAreas: await db.managementAreas.toArray(),
      releases: await db.releases.toArray(),
      contracts: await db.contracts.toArray(),
      annotations: await db.annotations.toArray(),
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `topof-arc-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import database
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.systems || !data.version) {
        alert('Ogiltig TopofArc-export');
        return;
      }
      if (confirm(`Importera ${data.systems.length} system, ${data.integrations.length} integrationer och ${data.contracts.length} kontrakt?\n\nDetta ersätter ALL befintlig data.`)) {
        await Promise.all([
          db.systems.clear(), db.integrations.clear(), db.dataEntities.clear(),
          db.owners.clear(), db.managementAreas.clear(), db.releases.clear(),
          db.contracts.clear(), db.annotations.clear(),
        ]);
        await db.managementAreas.bulkAdd(data.managementAreas);
        await db.systems.bulkAdd(data.systems);
        await db.integrations.bulkAdd(data.integrations);
        await db.dataEntities.bulkAdd(data.dataEntities);
        await db.owners.bulkAdd(data.owners);
        await db.releases.bulkAdd(data.releases);
        await db.contracts.bulkAdd(data.contracts);
        await db.annotations.bulkAdd(data.annotations || []);
      }
    } catch (err) {
      alert('Kunde inte läsa filen: ' + err.message);
    }
    e.target.value = '';
  };

  if (!ready) {
    return (
      <div className="app-layout" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <div className="topnav-logo" style={{ width: 64, height: 64, fontSize: '1.2rem', margin: '0 auto 16px', borderRadius: 16 }}>TA</div>
          <div style={{ fontSize: 'var(--font-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>TopofArc</div>
          <div style={{ marginTop: 8 }}>Laddar arkitektur...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      {/* Top Navigation */}
      <nav className="topnav">
        <div className="topnav-brand">
          <div className="topnav-logo">TA</div>
          <span className="topnav-title">TopofArc</span>
        </div>

        <div className="topnav-nav">
          <NavLink to="/" end className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            <Map size={16} />
            Arkitektur
          </NavLink>
          <NavLink to="/dataflow" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            <GitBranch size={16} />
            Dataflöden
          </NavLink>
          <NavLink to="/releases" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            <Calendar size={16} />
            Releaser
          </NavLink>
          <NavLink to="/contracts" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            <FileText size={16} />
            Kontrakt
          </NavLink>
        </div>

        <div className="topnav-actions">
          {/* Global Search */}
          <div className="search-input" ref={searchRef} style={{ position: 'relative' }}>
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Sök system, integrationer, ägare..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            />
            {searchQuery && (
              <button
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2 }}
                onClick={() => setSearchQuery('')}
              >
                <X size={12} />
              </button>
            )}

            {/* Search Results Dropdown */}
            {searchFocused && searchResults.length > 0 && (
              <div className="search-dropdown">
                {searchResults.map((r, i) => (
                  <button key={`${r.type}-${r.id}-${i}`} className="search-result-item" onClick={() => handleSearchSelect(r)}>
                    <div className="flex items-center gap-sm" style={{ flex: 1 }}>
                      {r.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0 }} />}
                      <span className="text-sm font-semibold">{r.name}</span>
                    </div>
                    <div className="flex items-center gap-xs">
                      <span className="text-xs text-tertiary">{r.subtitle}</span>
                      <span className="search-type-badge">{r.type === 'system' ? 'System' : r.type === 'integration' ? 'Integration' : r.type === 'contract' ? 'Kontrakt' : 'Ägare'}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export/Import */}
          <button className="btn btn-ghost btn-sm" onClick={handleExport} title="Exportera data">
            <Download size={14} />
          </button>
          <label className="btn btn-ghost btn-sm" title="Importera data" style={{ cursor: 'pointer' }}>
            <Upload size={14} />
            <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
          </label>

          <button className="btn btn-primary btn-sm" onClick={() => setShowCreateSystem(true)}>
            <Plus size={14} /> Nytt system
          </button>
        </div>
      </nav>

      {/* Body */}
      <div className="app-body">
        {/* Sidebar */}
        <Sidebar
          systems={systems}
          managementAreas={managementAreas}
          selectedSystem={selectedSystem}
          onSelectSystem={setSelectedSystem}
          searchQuery={searchQuery}
        />

        {/* Main Content */}
        <div className="main-content">
          <Routes>
            <Route path="/" element={
              <ArchitectureCanvas
                selectedSystem={selectedSystem}
                onSelectSystem={setSelectedSystem}
                selectedIntegration={selectedIntegration}
                onSelectIntegration={setSelectedIntegration}
                showCreateSystem={showCreateSystem}
                onCloseCreateSystem={() => setShowCreateSystem(false)}
              />
            } />
            <Route path="/dataflow" element={<DataFlowView />} />
            <Route path="/releases" element={<ReleasePlanning />} />
            <Route path="/contracts" element={<ContractManager />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
