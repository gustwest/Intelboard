import { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Plus, FileText, ArrowRight, Eye, Trash2, Calendar } from 'lucide-react';
import ContractFormModal from '../components/ContractFormModal';

export default function ContractManager() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedContract, setSelectedContract] = useState(null);

  const contracts = useLiveQuery(() => db.contracts.toArray(), []) || [];
  const systems = useLiveQuery(() => db.systems.toArray(), []) || [];

  const systemMap = useMemo(() => {
    const m = {};
    systems.forEach((s) => (m[s.id] = s));
    return m;
  }, [systems]);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (confirm('Ta bort kontraktet?')) {
      await db.contracts.delete(id);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--border-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-xl)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={22} style={{ color: 'var(--accent-cyan)' }} />
            Kontrakt
          </h1>
          <p className="text-sm text-secondary" style={{ marginTop: 4 }}>
            Informationskontrakt & integrationskontrakt med visuell systemöversikt
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setSelectedContract(null); setShowCreate(true); }}>
          <Plus size={14} /> Nytt kontrakt
        </button>
      </div>

      {/* Contract List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {contracts.length === 0 ? (
          <div className="empty-state" style={{ height: '100%' }}>
            <FileText size={48} className="empty-state-icon" />
            <div className="empty-state-text">Inga kontrakt ännu. Skapa ett nytt kontrakt för att se den visuella systemöversikten.</div>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Skapa kontrakt
            </button>
          </div>
        ) : (
          <div className="contract-list">
            {contracts.map((contract) => (
              <div
                key={contract.id}
                className="contract-card"
                onClick={() => { setSelectedContract(contract); setShowCreate(true); }}
              >
                <div className="contract-card-header">
                  <div className="contract-card-title">{contract.title}</div>
                  <div className="flex items-center gap-xs">
                    <span className={`badge badge-${contract.status}`}>{contract.status === 'active' ? 'Aktivt' : contract.status === 'draft' ? 'Utkast' : contract.status}</span>
                    <button
                      className="btn btn-sm btn-danger"
                      style={{ padding: '2px 4px' }}
                      onClick={(e) => handleDelete(contract.id, e)}
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>

                <div className="contract-card-meta">
                  <span className={`badge badge-${contract.type === 'integration' ? 'api' : 'event'}`}>
                    {contract.type === 'integration' ? 'Integration' : 'Information'}
                  </span>
                </div>

                {contract.parsedContent && (
                  <div className="contract-card-systems">
                    <span style={{ fontWeight: 500 }}>{contract.parsedContent.sourceSystem}</span>
                    <ArrowRight size={12} className="contract-card-arrow" />
                    <span style={{ fontWeight: 500 }}>{contract.parsedContent.targetSystem}</span>
                  </div>
                )}

                {contract.parsedContent?.dataEntities && (
                  <div className="flex gap-xs flex-wrap" style={{ marginTop: 8 }}>
                    {contract.parsedContent.dataEntities.map((de, i) => (
                      <span key={i} className="badge badge-database" style={{ fontSize: '9px' }}>{de}</span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-sm" style={{ marginTop: 12, fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)' }}>
                  <Calendar size={10} />
                  {contract.validFrom} — {contract.validTo}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contract Form Modal */}
      {showCreate && (
        <ContractFormModal
          contract={selectedContract}
          systems={systems}
          onClose={() => { setShowCreate(false); setSelectedContract(null); }}
        />
      )}
    </div>
  );
}
