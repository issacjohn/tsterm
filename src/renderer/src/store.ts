import { DEFAULT_SETTINGS } from '@shared/themes'
import type {
  AiChatMessage,
  AiReferenceDoc,
  AppSettings,
  Bootstrap,
  CatalogBundle,
  ConnectError,
  DebugSession,
  Host,
  KnownHost,
  SessionInfo,
  SessionStatus,
  Snippet,
  UpdateInfo
} from '@shared/types'
import { create } from 'zustand'

export type SidebarView = 'hosts' | 'snippets' | 'known-hosts'
export type SettingsTab =
  | 'appearance'
  | 'terminal'
  | 'suggestions'
  | 'sessions'
  | 'ai'
  | 'data'
  | 'about'
export type TroubleshootTab = 'runbooks' | 'assistant'

export interface PendingConnect {
  hostId: string
  tabId: string
  paneId: string
  password?: string
  passphrase?: string
  trustFingerprint?: string
  rememberPassword?: boolean
}

export type ModalState =
  | null
  | { kind: 'host'; hostId?: string; connectAfter?: boolean }
  | {
      kind: 'device-type'
      hostId?: string
      tabId?: string
      paneId?: string
      current?: string
      title?: string
    }
  | { kind: 'settings'; tab?: SettingsTab }
  | { kind: 'sftp'; sessionId: string; title: string }
  | { kind: 'forwards'; sessionId: string; title: string }
  | { kind: 'snippets' }
  | { kind: 'debug' }
  | { kind: 'quit'; sessions: DebugSession[] }
  | { kind: 'help' }
  | { kind: 'new-device-type' }
  | { kind: 'password'; pending: PendingConnect; error?: string }
  | { kind: 'hostkey'; pending: PendingConnect; error: ConnectError }
  | { kind: 'known-hosts' }
  | { kind: 'palette' }
  | { kind: 'update'; info: UpdateInfo; manual: boolean }
  | { kind: 'command-browser'; query?: string; sessionId?: string; deviceTypeId?: string }
  | {
      kind: 'runbook'
      typeId: string
      workflowId: string
      values: Record<string, string>
      hostId?: string
      hostLabel: string
      hostname?: string
      sessionId?: string
    }

export interface PaneState {
  id: string
  kind: 'ssh' | 'local'
  hostId?: string
  sessionId?: string
  session?: SessionInfo
  title: string
  subtitle?: string
  status: SessionStatus | 'pending' | 'idle'
  deviceTypeId?: string
  error?: string
  cols: number
  rows: number
  createdAt: number
}

export interface TabState {
  id: string
  title: string
  panes: PaneState[]
  activePaneId: string
  layout: 'single' | 'horizontal' | 'vertical'
  createdAt: number
}

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  kind: ToastKind
  title: string
  message?: string
}

export interface AiThreadState {
  messages: AiChatMessage[]
  draft: string
  busy: boolean
  requestId?: string
  streamingText: string
  error?: string
  updatedAt: number
}

export const EMPTY_AI_THREAD: AiThreadState = {
  messages: [],
  draft: '',
  busy: false,
  streamingText: '',
  updatedAt: 0
}

export interface AppStore {
  ready: boolean
  bootstrap: Bootstrap | null
  settings: AppSettings
  hosts: Host[]
  snippets: Snippet[]
  knownHosts: KnownHost[]
  catalog: CatalogBundle
  debugSessions: DebugSession[]
  aiKeyIds: string[]
  referenceDocs: AiReferenceDoc[]
  aiThreads: Record<string, AiThreadState>
  troubleshootTab: TroubleshootTab
  tabs: TabState[]
  activeTabId: string | null
  sidebarView: SidebarView
  showSidebar: boolean
  showTroubleshoot: boolean
  modal: ModalState
  toasts: Toast[]
  appPlatform: string

  hydrate: (bootstrap: Bootstrap) => void
  setSettings: (settings: AppSettings) => void
  setHosts: (hosts: Host[]) => void
  setSnippets: (snippets: Snippet[]) => void
  setKnownHosts: (knownHosts: KnownHost[]) => void
  setCatalog: (catalog: CatalogBundle) => void
  setDebugSessions: (sessions: DebugSession[]) => void
  setAiKeyIds: (keyIds: string[]) => void
  setReferenceDocs: (docs: AiReferenceDoc[]) => void
  setAiThread: (
    key: string,
    patch: Partial<AiThreadState> | ((thread: AiThreadState) => Partial<AiThreadState>)
  ) => void
  deleteAiThread: (key: string) => void
  setTroubleshootTab: (tab: TroubleshootTab) => void
  setModal: (modal: ModalState) => void
  setSidebarView: (view: SidebarView) => void
  setShowSidebar: (show: boolean) => void
  setShowTroubleshoot: (show: boolean) => void

  addTab: (tab: TabState) => void
  removeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateTab: (tabId: string, patch: Partial<TabState>) => void
  addPane: (tabId: string, pane: PaneState) => void
  removePane: (tabId: string, paneId: string) => void
  updatePane: (tabId: string, paneId: string, patch: Partial<PaneState>) => void
  setActivePane: (tabId: string, paneId: string) => void
  setTabLayout: (tabId: string, layout: TabState['layout']) => void
  updatePaneBySession: (sessionId: string, patch: Partial<PaneState>) => void
  updatePanesForHost: (hostId: string, patch: Partial<PaneState>) => void
  getPane: (tabId: string, paneId: string) => PaneState | undefined

  notify: (toast: Omit<Toast, 'id'> & { duration?: number }) => void
  dismissToast: (id: string) => void
}

function uid(): string {
  return crypto.randomUUID()
}

function patchTab(tabs: TabState[], tabId: string, updater: (tab: TabState) => TabState): TabState[] {
  return tabs.map((tab) => (tab.id === tabId ? updater(tab) : tab))
}

export const useAppStore = create<AppStore>((set, get) => ({
  ready: false,
  bootstrap: null,
  settings: DEFAULT_SETTINGS,
  hosts: [],
  snippets: [],
  knownHosts: [],
  catalog: { types: [], issues: [], loadedAt: new Date().toISOString() },
  debugSessions: [],
  aiKeyIds: [],
  referenceDocs: [],
  aiThreads: {},
  troubleshootTab: 'runbooks',
  tabs: [],
  activeTabId: null,
  sidebarView: 'hosts',
  showSidebar: true,
  showTroubleshoot: true,
  modal: null,
  toasts: [],
  appPlatform: 'win32',

  hydrate: (bootstrap) =>
    set({
      ready: true,
      bootstrap,
      settings: bootstrap.settings,
      hosts: bootstrap.hosts,
      snippets: bootstrap.snippets,
      knownHosts: bootstrap.knownHosts,
      catalog: bootstrap.catalog,
      debugSessions: bootstrap.debugSessions,
      aiKeyIds: bootstrap.aiKeyIds,
      referenceDocs: bootstrap.referenceDocs ?? [],
      showSidebar: bootstrap.settings.showSidebar,
      showTroubleshoot: bootstrap.settings.showTroubleshootPanel,
      appPlatform: bootstrap.platform
    }),
  setSettings: (settings) =>
    set({
      settings,
      showSidebar: settings.showSidebar,
      showTroubleshoot: settings.showTroubleshootPanel
    }),
  setHosts: (hosts) => set({ hosts }),
  setSnippets: (snippets) => set({ snippets }),
  setKnownHosts: (knownHosts) => set({ knownHosts }),
  setCatalog: (catalog) => set({ catalog }),
  setDebugSessions: (debugSessions) => set({ debugSessions }),
  setAiKeyIds: (aiKeyIds) => set({ aiKeyIds }),
  setReferenceDocs: (referenceDocs) => set({ referenceDocs }),
  setAiThread: (key, patch) =>
    set((state) => {
      if (!key) return state
      const current = state.aiThreads[key] ?? { ...EMPTY_AI_THREAD }
      const value = typeof patch === 'function' ? patch(current) : patch
      return {
        aiThreads: {
          ...state.aiThreads,
          [key]: { ...current, ...value, updatedAt: Date.now() }
        }
      }
    }),
  deleteAiThread: (key) =>
    set((state) => {
      if (!state.aiThreads[key]) return state
      const next = { ...state.aiThreads }
      delete next[key]
      return { aiThreads: next }
    }),
  setTroubleshootTab: (troubleshootTab) => set({ troubleshootTab }),
  setModal: (modal) => set({ modal }),
  setSidebarView: (sidebarView) => set({ sidebarView }),
  setShowSidebar: (showSidebar) => set({ showSidebar }),
  setShowTroubleshoot: (showTroubleshoot) => set({ showTroubleshoot }),

  addTab: (tab) =>
    set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id })),
  removeTab: (tabId) =>
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== tabId)
      const activeTabId =
        state.activeTabId === tabId ? tabs[tabs.length - 1]?.id ?? null : state.activeTabId
      return { tabs, activeTabId }
    }),
  setActiveTab: (activeTabId) => set({ activeTabId }),
  updateTab: (tabId, patch) =>
    set((state) => ({
      tabs: patchTab(state.tabs, tabId, (tab) => ({ ...tab, ...patch }))
    })),
  addPane: (tabId, pane) =>
    set((state) => ({
      tabs: patchTab(state.tabs, tabId, (tab) => ({
        ...tab,
        panes: [...tab.panes, pane],
        activePaneId: pane.id,
        layout: tab.panes.length === 0 ? 'single' : tab.layout === 'single' ? 'horizontal' : tab.layout
      }))
    })),
  removePane: (tabId, paneId) =>
    set((state) => ({
      tabs: patchTab(state.tabs, tabId, (tab) => {
        const panes = tab.panes.filter((pane) => pane.id !== paneId)
        return {
          ...tab,
          panes,
          activePaneId: tab.activePaneId === paneId ? panes[panes.length - 1]?.id ?? '' : tab.activePaneId,
          layout: panes.length <= 1 ? 'single' : tab.layout
        }
      })
    })),
  updatePane: (tabId, paneId, patch) =>
    set((state) => ({
      tabs: patchTab(state.tabs, tabId, (tab) => ({
        ...tab,
        panes: tab.panes.map((pane) => (pane.id === paneId ? { ...pane, ...patch } : pane))
      }))
    })),
  setActivePane: (tabId, paneId) =>
    set((state) => ({
      tabs: patchTab(state.tabs, tabId, (tab) => ({ ...tab, activePaneId: paneId }))
    })),
  setTabLayout: (tabId, layout) =>
    set((state) => ({
      tabs: patchTab(state.tabs, tabId, (tab) => ({ ...tab, layout }))
    })),
  updatePaneBySession: (sessionId, patch) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => ({
        ...tab,
        panes: tab.panes.map((pane) =>
          pane.sessionId === sessionId ? { ...pane, ...patch } : pane
        )
      }))
    })),
  updatePanesForHost: (hostId, patch) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => ({
        ...tab,
        panes: tab.panes.map((pane) => (pane.hostId === hostId ? { ...pane, ...patch } : pane))
      }))
    })),
  getPane: (tabId, paneId) => {
    const tab = get().tabs.find((item) => item.id === tabId)
    return tab?.panes.find((pane) => pane.id === paneId)
  },

  notify: ({ duration = 5000, ...toast }) => {
    const id = uid()
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
    window.setTimeout(() => get().dismissToast(id), duration)
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
}))

export function newPane(input: {
  kind: 'ssh' | 'local'
  title: string
  hostId?: string
  subtitle?: string
  deviceTypeId?: string
  cols?: number
  rows?: number
}): PaneState {
  return {
    id: uid(),
    kind: input.kind,
    hostId: input.hostId,
    title: input.title,
    subtitle: input.subtitle,
    status: 'pending',
    deviceTypeId: input.deviceTypeId,
    cols: input.cols ?? 100,
    rows: input.rows ?? 30,
    createdAt: Date.now()
  }
}

export function newTab(pane: PaneState): TabState {
  return {
    id: uid(),
    title: pane.title,
    panes: [pane],
    activePaneId: pane.id,
    layout: 'single',
    createdAt: Date.now()
  }
}

export function activeTab(state: AppStore): TabState | undefined {
  return state.tabs.find((tab) => tab.id === state.activeTabId)
}

export function activePane(state: AppStore): PaneState | undefined {
  const tab = activeTab(state)
  return tab?.panes.find((pane) => pane.id === tab.activePaneId) ?? tab?.panes[0]
}
