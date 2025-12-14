import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { Edge, Node } from '@xyflow/react';

// --- Types ---

export type SystemType =
  | 'Source System'
  | 'Data Warehouse'
  | 'Data Lake'
  | 'Data Vault'
  | 'Data Mart'
  | 'PBI Report'
  | 'Other';

export interface User {
  id: string;
  name: string;
  role: string;
  avatar?: string; // URL or placeholder
}

export interface SystemDocument {
  id: string;
  name: string;
  type: string; // MIME type e.g., 'application/pdf'
  content: string; // Base64 or text content? For PDFs, maybe we store a reference or Blob URL if persistent? 
  // For this demo, we might just store metadata or small content. 
  // Storing large Base64 strings in localStorage (via persist) is bad for performance.
  // Let's assume we store metadata and maybe a simulated "url" or just keep it in memory if possible?
  // The user wants to "store documents". 
  // We'll store metadata + a simulated URL or small content. 
  // CAUTION: LocalStorage has 5MB limit. Storing PDFs will crash it.
  // We should probably NOT persist the actual file content in localStorage if it's large.
  // But since we don't have a backend, we might have to warn or limit.
  // Let's store metadata only for now, and maybe "content" if it's text.
  // For PDFs, we might just pretend to store it or use IndexedDB (too complex for now).
  // Let's stick to metadata and maybe a warning.
  uploadedBy: string; // User ID
  uploadedAt: string; // ISO Date
}

export interface Asset {
  id: string;
  name: string;
  type: string; // e.g., 'Table', 'View', 'File', 'Report'
  description?: string;
  schema?: string; // Database schema (e.g., 'public', 'finance')
  systemId: string;
  status: 'Existing' | 'Planned';
  verificationStatus?: 'Verified' | 'Unverified';
  columns?: { name: string; type: string }[];
}

export interface System {
  id: string;
  name: string;
  type: SystemType;
  description?: string;
  assets: Asset[];
  documents: SystemDocument[];
  // Position for the node in the flow
  position: { x: number; y: number };
}

export interface Integration {
  id: string;
  sourceAssetId: string;
  targetSystemId: string;
  description?: string;
  technology?: string; // e.g., 'Kafka', 'OGG', 'Informatica', 'API'
  mode?: string; // e.g., 'Streaming', 'Batch', 'CDC'
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  systemIds: string[];
  ownerId: string;
  sharedWith: string[]; // List of User IDs
}

interface AppState {
  systems: System[];
  integrations: Integration[];
  projects: Project[];
  activeProjectId: string | null;

  users: User[];
  currentUser: User | null;

  // Actions
  addSystem: (system: Omit<System, 'id' | 'assets' | 'documents'> & { id?: string; assets?: Asset[]; documents?: SystemDocument[] }) => void;
  updateSystem: (id: string, updates: Partial<Omit<System, 'id' | 'assets'>>) => void;
  deleteSystem: (id: string) => void;
  updateSystemPosition: (id: string, position: { x: number; y: number }) => void;

  addAsset: (systemId: string, asset: Omit<Asset, 'id' | 'systemId'> & { id?: string }) => void;
  updateAsset: (systemId: string, assetId: string, updates: Partial<Omit<Asset, 'id' | 'systemId'>>) => void;
  bulkUpdateAssets: (systemId: string, assetIds: string[], updates: Partial<Omit<Asset, 'id' | 'systemId'>>) => void;
  verifyAsset: (systemId: string, assetId: string) => void;
  importSystems: (newSystems: System[]) => void;

  addIntegration: (integration: Omit<Integration, 'id'> & { id?: string }) => void;
  updateIntegration: (id: string, updates: Partial<Omit<Integration, 'id'>>) => void;
  removeIntegration: (id: string) => void;

  // Project Actions
  addProject: (project: Omit<Project, 'id' | 'ownerId' | 'sharedWith'>) => void;
  updateProject: (id: string, updates: Partial<Omit<Project, 'id'>>) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  toggleSystemInProject: (projectId: string, systemId: string) => void;

  // User & Document Actions
  addUser: (user: Omit<User, 'id'>) => void;
  switchUser: (userId: string) => void;
  addDocument: (systemId: string, document: Omit<SystemDocument, 'id' | 'uploadedAt'>) => void;
  removeDocument: (systemId: string, documentId: string) => void;

  // Selectors/Helpers
  getSystem: (id: string) => System | undefined;
  getAsset: (id: string) => Asset | undefined;
}

// --- Store ---

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      systems: [],
      integrations: [],
      projects: [],
      activeProjectId: null,
      users: [
        { id: '1', name: 'Admin User', role: 'Administrator', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin' }
      ],
      currentUser: { id: '1', name: 'Admin User', role: 'Administrator', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin' },

      addSystem: (system) => set((state) => {
        const newSystemId = system.id || uuidv4();
        // If there is an active project, auto-add the new system to it
        const newProjects = state.activeProjectId
          ? state.projects.map(p => p.id === state.activeProjectId ? { ...p, systemIds: [...p.systemIds, newSystemId] } : p)
          : state.projects;

        return {
          systems: [
            ...state.systems,
            {
              ...system,
              id: newSystemId,
              assets: system.assets || [],
              documents: system.documents || []
            }
          ],
          projects: newProjects
        };
      }),

      updateSystem: (id, updates) => set((state) => ({
        systems: state.systems.map((s) =>
          s.id === id ? { ...s, ...updates } : s
        )
      })),

      deleteSystem: (id) => set((state) => ({
        systems: state.systems.filter((s) => s.id !== id),
        // Cascade delete integrations where this system is target OR source (via its assets)
        integrations: state.integrations.filter((i) => {
          const isTarget = i.targetSystemId === id;
          const sourceSystem = state.systems.find(s => s.assets.some(a => a.id === i.sourceAssetId));
          const isSource = sourceSystem?.id === id;
          return !isTarget && !isSource;
        }),
        // Remove from projects
        projects: state.projects.map(p => ({
          ...p,
          systemIds: p.systemIds.filter(sid => sid !== id)
        }))
      })),

      updateSystemPosition: (id, position) => set((state) => ({
        systems: state.systems.map((s) =>
          s.id === id ? { ...s, position } : s
        )
      })),

      addAsset: (systemId, asset) => set((state) => ({
        systems: state.systems.map((s) =>
          s.id === systemId
            ? { ...s, assets: [...s.assets, { ...asset, id: asset.id || uuidv4(), systemId }] }
            : s
        )
      })),

      updateAsset: (systemId, assetId, updates) => set((state) => ({
        systems: state.systems.map((s) =>
          s.id === systemId
            ? {
              ...s,
              assets: s.assets.map((a) =>
                a.id === assetId ? { ...a, ...updates } : a
              )
            }
            : s
        )
      })),

      bulkUpdateAssets: (systemId, assetIds, updates) => set((state) => ({
        systems: state.systems.map((s) =>
          s.id === systemId
            ? {
              ...s,
              assets: s.assets.map((a) =>
                assetIds.includes(a.id) ? { ...a, ...updates } : a
              )
            }
            : s
        )
      })),

      verifyAsset: (systemId, assetId) => set((state) => ({
        systems: state.systems.map((s) =>
          s.id === systemId
            ? {
              ...s,
              assets: s.assets.map((a) =>
                a.id === assetId ? { ...a, verificationStatus: 'Verified' } : a
              )
            }
            : s
        )
      })),

      importSystems: (newSystems) => set((state) => {
        const newSystemIds = newSystems.map(s => s.id);

        // If there is an active project, add the new systems to it
        const newProjects = state.activeProjectId
          ? state.projects.map(p =>
            p.id === state.activeProjectId
              ? { ...p, systemIds: [...p.systemIds, ...newSystemIds] }
              : p
          )
          : state.projects;

        return {
          systems: [...state.systems, ...newSystems],
          projects: newProjects
        };
      }),

      addIntegration: (integration) => set((state) => ({
        integrations: [
          ...state.integrations,
          { ...integration, id: integration.id || uuidv4() }
        ]
      })),

      updateIntegration: (id, updates) => set((state) => ({
        integrations: state.integrations.map((i) =>
          i.id === id ? { ...i, ...updates } : i
        )
      })),

      removeIntegration: (id) => set((state) => ({
        integrations: state.integrations.filter((i) => i.id !== id)
      })),

      // Project Actions
      addProject: (project) => set((state) => ({
        projects: [...state.projects, {
          ...project,
          id: uuidv4(),
          ownerId: state.currentUser?.id || 'unknown',
          sharedWith: []
        }]
      })),

      updateProject: (id, updates) => set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        )
      })),

      deleteProject: (id) => set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        activeProjectId: state.activeProjectId === id ? null : state.activeProjectId
      })),

      setActiveProject: (id) => set({ activeProjectId: id }),

      toggleSystemInProject: (projectId, systemId) => set((state) => ({
        projects: state.projects.map((p) => {
          if (p.id !== projectId) return p;
          const exists = p.systemIds.includes(systemId);
          return {
            ...p,
            systemIds: exists
              ? p.systemIds.filter((id) => id !== systemId)
              : [...p.systemIds, systemId]
          };
        })
      })),

      // User & Document Actions
      addUser: (user) => set((state) => ({
        users: [...state.users, { ...user, id: uuidv4() }]
      })),

      switchUser: (userId) => set((state) => ({
        currentUser: state.users.find(u => u.id === userId) || state.currentUser
      })),

      addDocument: (systemId, document) => set((state) => ({
        systems: state.systems.map((s) =>
          s.id === systemId
            ? {
              ...s,
              documents: [...(s.documents || []), {
                ...document,
                id: uuidv4(),
                uploadedAt: new Date().toISOString()
              }]
            }
            : s
        )
      })),

      removeDocument: (systemId, documentId) => set((state) => ({
        systems: state.systems.map((s) =>
          s.id === systemId
            ? {
              ...s,
              documents: (s.documents || []).filter(d => d.id !== documentId)
            }
            : s
        )
      })),

      getSystem: (id) => get().systems.find((s) => s.id === id),
      getAsset: (id) => {
        for (const system of get().systems) {
          const asset = system.assets.find((a) => a.id === id);
          if (asset) return asset;
        }
        return undefined;
      },
    }),
    {
      name: 'it-system-workflow-storage',
    }
  )
);
