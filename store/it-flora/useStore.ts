import { create } from 'zustand';
import { liveblocks, WithLiveblocks } from '@liveblocks/zustand';
import { v4 as uuidv4 } from 'uuid';
import { Edge, Node } from '@xyflow/react';
import { client } from "@/lib/liveblocks";
import { mockUsers } from "@/lib/data";

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
  avatar?: string;
  company?: string;
  companyId?: string; // Links to DB company
  color?: string; // Visually distinguish users
}

export interface SystemDocument {
  id: string;
  name: string;
  type: string;
  content: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface Asset {
  id: string;
  name: string;
  type: string;
  description?: string;
  schema?: string;
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
  position: { x: number; y: number };
  ownerId: string; // New: Ownership
  sharedWith: string[]; // New: Sharing
}

export interface Integration {
  id: string;
  sourceAssetId: string;
  targetSystemId: string;
  description?: string;
  technology?: string;
  mode?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  systemIds: string[];
  ownerId: string;
  sharedWith: string[];
  notes?: string;
  projectImages?: string[];
  flowData?: {
    nodes: Node[];
    edges: Edge[];
  };
}

interface AppState {
  systems: System[];
  integrations: Integration[];
  projects: Project[];
  activeProjectId: string | null;

  users: User[];
  currentUser: User | null;

  // Actions
  addSystem: (system: Omit<System, 'id' | 'assets' | 'documents' | 'ownerId' | 'sharedWith'> & { id?: string; assets?: Asset[]; documents?: SystemDocument[] }) => void;
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
  addProject: (project: Omit<Project, 'id' | 'sharedWith' | 'ownerId'> & { ownerId?: string }) => string;
  updateProject: (id: string, updates: Partial<Omit<Project, 'id'>>) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  toggleSystemInProject: (projectId: string, systemId: string) => void;
  setProjects: (projects: Project[]) => void;
  setSystems: (systems: System[]) => void;

  // User & Document Actions
  addUser: (user: Omit<User, 'id'>) => void;
  switchUser: (userId: string) => void;
  setCurrentUser: (user: User | null) => void; // New action
  addDocument: (systemId: string, document: Omit<SystemDocument, 'id' | 'uploadedAt'>) => void;
  removeDocument: (systemId: string, documentId: string) => void;

  // Selectors/Helpers
  getSystem: (id: string) => System | undefined;
  getAsset: (id: string) => Asset | undefined;

  activeTool: 'flowchart' | 'lineage';
  setActiveTool: (tool: 'flowchart' | 'lineage') => void;

  activeViewId: string | null;
  setActiveViewId: (id: string | null) => void;
}

// --- Store ---

// Helper to safely read from localStorage
const getSavedUser = (): User | null => {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem('it-planner-user');
  return saved ? JSON.parse(saved) : null;
};

// Safe initialization
const initialState = {
  systems: [],
  integrations: [],
  projects: [],
  activeProjectId: null,
  users: mockUsers as User[],
  currentUser: getSavedUser() || (mockUsers[0] as User)
};

export const useStore = create<WithLiveblocks<AppState>>()(
  liveblocks(
    (set, get) => ({
      ...initialState,

      setCurrentUser: (user) => {
        if (user) localStorage.setItem('it-planner-user', JSON.stringify(user));
        else localStorage.removeItem('it-planner-user');
        set({ currentUser: user });
      },

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
              documents: system.documents || [],
              ownerId: state.currentUser?.id || 'unknown', // Capture owner
              sharedWith: []
            }
          ],
          projects: newProjects
        };
      }),

      updateSystem: (id, updates) => {
        import("@/lib/actions").then(actions => actions.updateSystem(id, updates));
        set((state) => ({
          systems: state.systems.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          )
        }));
      },

      deleteSystem: (id) => {
        import("@/lib/actions").then(actions => actions.deleteSystem(id));
        set((state) => ({
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
        }));
      },

      updateSystemPosition: (id, position) => {
        import("@/lib/actions").then(actions => actions.updateSystemPosition(id, position));
        set((state) => ({
          systems: state.systems.map((s) =>
            s.id === id ? { ...s, position } : s
          )
        }));
      },

      addAsset: (systemId, asset) => {
        const newAsset = { ...asset, id: asset.id || uuidv4(), systemId };
        import("@/lib/actions").then(actions => actions.addAsset(systemId, newAsset));
        set((state) => ({
          systems: state.systems.map((s) =>
            s.id === systemId
              ? { ...s, assets: [...s.assets, newAsset] }
              : s
          )
        }));
      },

      updateAsset: (systemId, assetId, updates) => {
        import("@/lib/actions").then(actions => actions.updateAsset(assetId, updates));
        set((state) => ({
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
        }));
      },

      bulkUpdateAssets: (systemId, assetIds, updates) => {
        // TODO: Add bulk server action if needed, for now iterate? Or simpler, rely on verification
        // For now, let's skip bulk pending action creation or loop
        assetIds.forEach(id => {
          import("@/lib/actions").then(actions => actions.updateAsset(id, updates));
        });
        set((state) => ({
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
        }));
      },

      verifyAsset: (systemId, assetId) => {
        import("@/lib/actions").then(actions => actions.verifyAsset(assetId));
        set((state) => ({
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
        }));
      },

      importSystems: (newSystems) => set((state) => {
        const newSystemIds = newSystems.map(s => s.id);
        const newProjects = state.activeProjectId
          ? state.projects.map(p =>
            p.id === state.activeProjectId
              ? { ...p, systemIds: [...p.systemIds, ...newSystemIds] }
              : p
          )
          : state.projects;

        // Note: Import usually happens via server action directly in UI component? 
        // If not, we should probably persist here too. 
        // But for now, assuming Import Modal handles persistence.
        return {
          systems: [...state.systems, ...newSystems],
          projects: newProjects
        };
      }),

      addIntegration: (integration) => {
        const newIntegration = { ...integration, id: integration.id || uuidv4() };
        import("@/lib/actions").then(actions => actions.addIntegration(newIntegration));
        set((state) => ({
          integrations: [
            ...state.integrations,
            newIntegration
          ]
        }));
      },

      updateIntegration: (id, updates) => set((state) => ({
        integrations: state.integrations.map((i) =>
          i.id === id ? { ...i, ...updates } : i
        )
      })),

      removeIntegration: (id) => set((state) => ({
        integrations: state.integrations.filter((i) => i.id !== id)
      })),

      // Project Actions
      addProject: (project) => {
        const newId = uuidv4();
        const projectData = {
          ...project,
          id: newId,
          ownerId: project.ownerId || get().currentUser?.id || 'unknown',
          sharedWith: []
        };

        // Push to Postgres
        import("@/lib/actions").then(actions => {
          actions.addProject(projectData);
        });

        set((state) => ({
          projects: [...state.projects, projectData as any]
        }));
        return newId;
      },

      updateProject: (id, updates) => {
        // Push to Postgres
        import("@/lib/actions").then(actions => {
          actions.updateProject(id, updates);
        });

        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          )
        }));
      },

      deleteProject: (id) => {
        // Push to Postgres
        import("@/lib/actions").then(actions => {
          actions.deleteProject(id);
        });

        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId
        }));
      },

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

      setProjects: (projects) => set({ projects }),
      setSystems: (systems) => set({ systems }),

      // User & Document Actions
      addUser: (user) => set((state) => ({
        users: [...state.users, { ...user, id: uuidv4() }]
      })),

      switchUser: (userId) => {
        const user = get().users.find(u => u.id === userId);
        if (user) {
          localStorage.setItem('it-planner-user', JSON.stringify(user));
          set({ currentUser: user });
        }
      },

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

      activeTool: 'flowchart',
      setActiveTool: (tool) => set({ activeTool: tool }),

      activeViewId: null,
      setActiveViewId: (id) => set({ activeViewId: id }),
    }),
    {
      client,
      storageMapping: {
        systems: true,
        integrations: true,
        projects: true,
        users: true
      },
      presenceMapping: {
        currentUser: true
      }
    }
  )
);
