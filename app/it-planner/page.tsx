'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/it-flora/Sidebar';
import { CreateSystemModal } from '@/components/it-flora/modals/CreateSystemModal';
import { EditSystemModal } from '@/components/it-flora/modals/EditSystemModal';
import { AssetModal } from '@/components/it-flora/modals/AssetModal';
import { IntegrationDetailsModal } from '@/components/it-flora/modals/IntegrationDetailsModal';
import { ProjectModal } from '@/components/it-flora/modals/ProjectModal';
import { ManageProjectSystemsModal } from '@/components/it-flora/modals/ManageProjectSystemsModal';
import { DataCatalogueModal } from '@/components/it-flora/modals/DataCatalogueModal';
import { AIImportModal } from '@/components/it-flora/modals/AIImportModal';
import { UserManagementModal } from '@/components/it-flora/modals/UserManagementModal';
import { SystemDetailsPanel } from '@/components/it-flora/SystemDetailsPanel';
import FlowCanvas from '@/components/it-flora/flow/FlowCanvas';

export default function Home() {
  const [isSystemModalOpen, setIsSystemModalOpen] = useState(false);
  const [isEditSystemModalOpen, setIsEditSystemModalOpen] = useState(false);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [isIntegrationModalOpen, setIsIntegrationModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isManageSystemsModalOpen, setIsManageSystemsModalOpen] = useState(false);
  const [isCatalogueModalOpen, setIsCatalogueModalOpen] = useState(false);
  const [isAIImportModalOpen, setIsAIImportModalOpen] = useState(false);
  const [isUserManagementModalOpen, setIsUserManagementModalOpen] = useState(false);

  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // System Details Panel State
  const [detailsSystemId, setDetailsSystemId] = useState<string | null>(null);

  // Lineage State
  const [selectedAssetIdForLineage, setSelectedAssetIdForLineage] = useState<string | null>(null);

  const handleAddAsset = (systemId: string) => {
    setSelectedSystemId(systemId);
    setSelectedAssetId(null); // Clear for new asset
    setIsAssetModalOpen(true);
  };

  const handleEditAsset = (systemId: string, assetId: string) => {
    setSelectedSystemId(systemId);
    setSelectedAssetId(assetId);
    setIsAssetModalOpen(true);
  };

  const handleEditSystem = (systemId: string) => {
    setSelectedSystemId(systemId);
    setIsEditSystemModalOpen(true);
  };

  const handleEdgeClick = (edgeId: string) => {
    setSelectedIntegrationId(edgeId);
    setIsIntegrationModalOpen(true);
  };

  const handleAddProject = () => {
    setSelectedProjectId(null);
    setIsProjectModalOpen(true);
  };

  const handleEditProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setIsProjectModalOpen(true);
  };

  const handleSystemClick = (systemId: string) => {
    setDetailsSystemId(systemId);
    // Clear specific asset lineage when clicking a system directly, 
    // to revert to standard system lineage or just selection
    setSelectedAssetIdForLineage(null);
  };

  const handleAssetSelectFromCatalogue = (assetId: string, systemId: string) => {
    setSelectedAssetIdForLineage(assetId);
    // The FlowCanvas will handle the highlighting and opening the details panel via the prop change
  };

  return (
    <main className="flex h-[calc(100vh-3.5rem)] w-full bg-white text-slate-900 overflow-hidden">
      <Sidebar
        onAddSystem={() => setIsSystemModalOpen(true)}
        onAddProject={handleAddProject}
        onEditProject={handleEditProject}
        onManageSystems={() => setIsManageSystemsModalOpen(true)}
        onOpenCatalogue={() => setIsCatalogueModalOpen(true)}
        onImportAI={() => setIsAIImportModalOpen(true)}
        onOpenUserManagement={() => setIsUserManagementModalOpen(true)}
      />

      <div className="flex-1 relative bg-slate-50/50">
        <FlowCanvas
          onAddAsset={handleAddAsset}
          onEditAsset={handleEditAsset}
          onEdgeClick={handleEdgeClick}
          onEditSystem={handleEditSystem}
          onSystemClick={handleSystemClick}
          selectedAssetIdForLineage={selectedAssetIdForLineage}
        />
      </div>

      {/* Right Side Panel */}
      {detailsSystemId && (
        <SystemDetailsPanel
          systemId={detailsSystemId}
          onClose={() => setDetailsSystemId(null)}
          onEditSystem={handleEditSystem}
        />
      )}

      <CreateSystemModal
        isOpen={isSystemModalOpen}
        onClose={() => setIsSystemModalOpen(false)}
      />

      <EditSystemModal
        isOpen={isEditSystemModalOpen}
        onClose={() => setIsEditSystemModalOpen(false)}
        systemId={selectedSystemId}
      />

      <AssetModal
        isOpen={isAssetModalOpen}
        onClose={() => setIsAssetModalOpen(false)}
        systemId={selectedSystemId}
        assetId={selectedAssetId}
      />

      <IntegrationDetailsModal
        isOpen={isIntegrationModalOpen}
        onClose={() => setIsIntegrationModalOpen(false)}
        integrationId={selectedIntegrationId}
      />

      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        projectId={selectedProjectId}
      />

      <ManageProjectSystemsModal
        isOpen={isManageSystemsModalOpen}
        onClose={() => setIsManageSystemsModalOpen(false)}
      />

      <DataCatalogueModal
        isOpen={isCatalogueModalOpen}
        onClose={() => setIsCatalogueModalOpen(false)}
        onSelectAsset={handleAssetSelectFromCatalogue}
      />

      <AIImportModal
        isOpen={isAIImportModalOpen}
        onClose={() => setIsAIImportModalOpen(false)}
      />

      <UserManagementModal
        isOpen={isUserManagementModalOpen}
        onClose={() => setIsUserManagementModalOpen(false)}
      />
    </main>
  );
}
