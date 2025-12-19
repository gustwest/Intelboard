'use client';

import { Suspense } from 'react';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRequests } from "@/hooks/use-requests";
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
import { useStore } from "@/store/it-flora/useStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectNotes } from "@/components/it-flora/ProjectNotes";
import { FreeformFlow } from "@/components/it-flora/FreeformFlow";
import { RoomProvider } from "@liveblocks/react/suspense";
import { LiveblocksProvider } from "@liveblocks/react";
import { LiveCursor } from "@/components/LiveCursor";
import { ClientSideSuspense } from "@liveblocks/react";
import { client, API_KEY } from "@/liveblocks.config";

function ITPlannerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { requests, updateRequest } = useRequests();
  const setActiveProject = useStore((state) => state.setActiveProject);
  const activeProjectId = useStore((state) => state.activeProjectId);

  // Join the Liveblocks room for Zustand store sync dynamically
  useEffect(() => {
    // @ts-ignore - liveblocks middleware attaches this to the store api
    const lb = useStore.liveblocks;
    if (lb && activeProjectId) {
      const roomName = `project-${activeProjectId}`;
      lb.enterRoom(roomName);
      return () => {
        lb.leaveRoom(roomName);
      };
    }
  }, [activeProjectId]);

  // Redirect State
  const createForRequestId = searchParams.get('createForRequestId');
  const requestTitle = searchParams.get('requestTitle');
  const deepLinkProjectId = searchParams.get('projectId');

  useEffect(() => {
    if (deepLinkProjectId) {
      setActiveProject(deepLinkProjectId);
    }
  }, [deepLinkProjectId, setActiveProject]);
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

  // Trigger modal if params exist
  useEffect(() => {
    if (createForRequestId) {
      setIsProjectModalOpen(true);
    }
  }, [createForRequestId]);

  const handleProjectCreated = (newProjectId: string) => {
    if (createForRequestId) {
      const request = requests.find(r => r.id === createForRequestId);
      if (request) {
        updateRequest({ ...request, linkedProjectId: newProjectId });
        // Redirect back to request
        router.push(`/requests/${createForRequestId}`);
      }
    }
  };

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
    <main className="flex h-[calc(100vh-3.5rem)] w-full bg-white text-slate-900 overflow-hidden relative">
      {/* <LiveCursor /> */}
      <Sidebar
        onAddSystem={() => setIsSystemModalOpen(true)}
        onAddProject={handleAddProject}
        onEditProject={handleEditProject}
        onManageSystems={() => setIsManageSystemsModalOpen(true)}
        onOpenCatalogue={() => setIsCatalogueModalOpen(true)}
        onImportAI={() => setIsAIImportModalOpen(true)}
        onOpenUserManagement={() => setIsUserManagementModalOpen(true)}
      />

      <div className="flex-1 relative bg-slate-50/50 flex flex-col overflow-hidden">
        <Tabs defaultValue="flowchart" className="flex-1 flex flex-col">
          <div className="px-4 pt-2 border-b bg-white flex justify-between items-center">
            <TabsList>
              <TabsTrigger value="flowchart" disabled={!activeProjectId}>Freeform Flowchart</TabsTrigger>
              <TabsTrigger value="lineage">System Lineage</TabsTrigger>
            </TabsList>
            {!activeProjectId && <span className="text-xs text-muted-foreground mr-2">Select a project from the sidebar to start</span>}
          </div>

          <TabsContent value="lineage" className="flex-1 relative m-0 p-0 h-full">
            <FlowCanvas
              onAddAsset={handleAddAsset}
              onEditAsset={handleEditAsset}
              onEdgeClick={handleEdgeClick}
              onEditSystem={handleEditSystem}
              onSystemClick={handleSystemClick}
              selectedAssetIdForLineage={selectedAssetIdForLineage}
            />
          </TabsContent>

          <TabsContent value="flowchart" className="flex-1 relative m-0 p-0 h-full overflow-hidden">
            {activeProjectId ? (
              <FreeformFlow projectId={activeProjectId} />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">Select a project to use the whiteboard</div>
            )}
          </TabsContent>
        </Tabs>
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
        initialName={requestTitle ? `Project for: ${decodeURIComponent(requestTitle)}` : undefined}
        onSave={handleProjectCreated}
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

export default function Home() {
  const activeProjectId = useStore((state) => state.activeProjectId);
  const roomName = activeProjectId ? `project-${activeProjectId}` : "it-planner-global";

  return (
    <Suspense fallback={<div>Loading Details...</div>}>
      <LiveblocksProvider publicApiKey="pk_dev_t94HHDVA1uBZWUJ7u6glPN8-cFC0YLH-jO5QDAY9KovG3mwy5CHlgx9i1kLcCRpN">
        <RoomProvider
          id={roomName}
          initialPresence={{ cursor: null }}
          initialStorage={() => ({ systems: [], integrations: [], projects: [] })}
        >
          <ClientSideSuspense fallback={<div>Loading Collaborative Environment...</div>}>
            {() => <ITPlannerContent />}
          </ClientSideSuspense>
        </RoomProvider>
      </LiveblocksProvider>
    </Suspense>
  );
}
