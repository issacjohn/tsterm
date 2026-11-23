import { useEffect, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { MenuCommand } from '@shared/types'
import { activePane, useAppStore } from './store'
import {
  closeActiveTab,
  openHostEditor,
  openLocalTerminal,
  reconnectActivePane,
  saveSettings
} from './lib/session-actions'
import { terminalDataBus } from './lib/terminal-bus'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { TabStrip } from './components/TabStrip'
import { SessionToolbar } from './components/SessionToolbar'
import { TerminalWorkspace } from './components/TerminalWorkspace'
import { TroubleshootPanel } from './components/TroubleshootPanel'
import { StatusBar } from './components/StatusBar'
import { Toasts } from './components/Toasts'
import { ModalRoot } from './components/ModalRoot'
import { Logo } from './components/ui/Logo'

function LoadingScreen({ error }: { error?: string | null }): React.JSX.Element {
  return (
    <div className="splash">
      <div className="splash-orb" />
      <div className="splash-brand">
        <Logo size={54} />
        <div>
          <h1>TSTerm</h1>
          <p>Network troubleshooting console</p>
        </div>
      </div>
      {error ? (
        <div className="splash-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : (
        <div className="splash-loading">
          <Loader2 size={16} className="spin" /> Loading workspace…
        </div>
      )}
    </div>
  )
}

export default function App(): React.JSX.Element {
  const ready = useAppStore((state) => state.ready)
  const settings = useAppStore((state) => state.settings)
  const showSidebar = useAppStore((state) => state.showSidebar)
  const showTroubleshoot = useAppStore((state) => state.showTroubleshoot)
  const tabs = useAppStore((state) => state.tabs)
  const [bootError, setBootError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    const unsubscribers: Array<() => void> = []

    unsubscribers.push(
      window.tsterm.terminals.onData((event) => {
        terminalDataBus.ingest(event.terminalId, event.data)
      })
    )

    unsubscribers.push(
      window.tsterm.terminals.onStatus((event) => {
        const state = useAppStore.getState()
        let pane = null
        for (const tab of state.tabs) {
          const found = tab.panes.find((item) => item.sessionId === event.terminalId)
          if (found) {
            pane = found
            break
          }
        }
        if (!pane) return
        const session = pane.session
          ? { ...pane.session, status: event.status, error: event.error, logPath: event.logPath ?? pane.session.logPath }
          : undefined
        state.updatePaneBySession(event.terminalId, {
          status: event.status,
          error: event.error,
          session
        })
      })
    )

    unsubscribers.push(
      window.tsterm.debug.onChanged((sessions) => {
        useAppStore.getState().setDebugSessions(sessions)
      })
    )

    unsubscribers.push(
      window.tsterm.settings.onChanged((next) => {
        useAppStore.getState().setSettings(next)
      })
    )

    unsubscribers.push(
      window.tsterm.app.onQuitRequest((sessions) => {
        useAppStore.getState().setModal({ kind: 'quit', sessions })
      })
    )

    unsubscribers.push(
      window.tsterm.app.onMenuCommand((command) => {
        handleMenuCommand(command)
      })
    )

    window.tsterm
      .bootstrap()
      .then((bootstrap) => {
        if (disposed) return
        useAppStore.getState().hydrate(bootstrap)
        const state = useAppStore.getState()
        if (bootstrap.warnings?.length) {
          state.notify({
            kind: 'warning',
            title: 'Local data warning',
            message: bootstrap.warnings[0],
            duration: 9000
          })
        }
        const errors = bootstrap.catalog.issues.filter((issue) => issue.severity === 'error')
        if (errors.length) {
          state.notify({
            kind: 'warning',
            title: `${errors.length} catalog issue${errors.length === 1 ? '' : 's'}`,
            message: 'Open Settings → Data & packs to review the device pack errors.',
            duration: 9000
          })
        }
        if (bootstrap.debugSessions.length) {
          state.notify({
            kind: 'warning',
            title: 'Debug sessions need review',
            message: `${bootstrap.debugSessions.length} debug session${bootstrap.debugSessions.length === 1 ? '' : 's'} from a previous run may still be active. Open the debug guard.`,
            duration: 12000
          })
        }
      })
      .catch((error) => {
        if (!disposed) setBootError((error as Error).message)
      })

    return () => {
      disposed = true
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.appTheme = settings.appTheme
    root.dataset.density = settings.density
    root.style.setProperty('--ui-scale', String(settings.uiScale))
    root.style.setProperty('--ui-font', settings.uiFontFamily)
  }, [settings.appTheme, settings.density, settings.uiScale, settings.uiFontFamily])

  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => {
      const state = useAppStore.getState()
      if (!state.settings.autoCheckUpdates) return
      if (state.modal) return
      void window.tsterm.updates
        .check(false)
        .then((result) => {
          if (!result.available || !result.update) return
          const current = useAppStore.getState()
          if (!current.settings.autoCheckUpdates) return
          if (current.settings.skippedUpdateVersion === result.update.latestVersion) return
          if (current.modal) return
          current.setModal({ kind: 'update', info: result.update, manual: false })
        })
        .catch(() => {
          // Update checks are opportunistic; never interrupt the user.
        })
    }, 1400)
    return () => window.clearTimeout(timer)
    // Run once per launch after the workspace is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const state = useAppStore.getState()
      if (state.modal) return
      const mod = event.ctrlKey || event.metaKey

      if (mod && event.key === 'Tab') {
        event.preventDefault()
        if (state.tabs.length < 2) return
        const index = state.tabs.findIndex((tab) => tab.id === state.activeTabId)
        const nextIndex = event.shiftKey
          ? (index - 1 + state.tabs.length) % state.tabs.length
          : (index + 1) % state.tabs.length
        state.setActiveTab(state.tabs[nextIndex].id)
        return
      }

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        saveSettings({ showTroubleshootPanel: !state.showTroubleshoot })
        return
      }

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        if (!state.settings.aiEnabled) {
          state.setModal({ kind: 'settings', tab: 'ai' })
          return
        }
        saveSettings({ showTroubleshootPanel: true })
        state.setTroubleshootTab('assistant')
        return
      }

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        state.setModal({ kind: 'debug' })
        return
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'q') {
        event.preventDefault()
        window.close()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!ready) return <LoadingScreen error={bootError} />
  if (bootError) return <LoadingScreen error={bootError} />

  return (
    <div
      className="app"
      data-app-theme={settings.appTheme}
      data-density={settings.density}
      style={
        {
          '--ui-scale': settings.uiScale,
          '--ui-font': settings.uiFontFamily
        } as React.CSSProperties
      }
    >
      <TopBar
        onToggleSidebar={() => saveSettings({ showSidebar: !showSidebar })}
        onOpenSettings={() => useAppStore.getState().setModal({ kind: 'settings' })}
        onOpenPalette={() => useAppStore.getState().setModal({ kind: 'palette' })}
        onOpenDebug={() => useAppStore.getState().setModal({ kind: 'debug' })}
      />

      <PanelGroup direction="horizontal" className="workspace" autoSaveId="tsterm-workspace">
        {showSidebar ? (
          <>
            <Panel defaultSize={settings.sidebarSize} minSize={16} maxSize={34} className="sidebar-panel">
              <Sidebar onOpenSettings={() => useAppStore.getState().setModal({ kind: 'settings' })} />
            </Panel>
            <PanelResizeHandle className="resize-handle vertical" />
          </>
        ) : null}
        <Panel minSize={35} className="main-panel">
          <main className="main-area">
            <TabStrip />
            <SessionToolbar
              onToggleTroubleshoot={() => saveSettings({ showTroubleshootPanel: !showTroubleshoot })}
            />
            <TerminalWorkspace />
          </main>
        </Panel>
        {showTroubleshoot && tabs.length ? (
          <>
            <PanelResizeHandle className="resize-handle vertical" />
            <Panel defaultSize={settings.troubleshootSize} minSize={20} maxSize={44} className="troubleshoot-wrap">
              <TroubleshootPanel />
            </Panel>
          </>
        ) : null}
      </PanelGroup>

      <StatusBar />
      <Toasts />
      <ModalRoot />
    </div>
  )
}

function handleMenuCommand(command: MenuCommand): void {
  const state = useAppStore.getState()
  switch (command) {
    case 'new-ssh':
      openHostEditor()
      break
    case 'new-local':
      openLocalTerminal()
      break
    case 'settings':
      state.setModal({ kind: 'settings' })
      break
    case 'troubleshoot':
      saveSettings({ showTroubleshootPanel: !state.showTroubleshoot })
      break
    case 'ai-assistant':
      if (!state.settings.aiEnabled) {
        state.setModal({ kind: 'settings', tab: 'ai' })
      } else {
        saveSettings({ showTroubleshootPanel: true })
        state.setTroubleshootTab('assistant')
      }
      break
    case 'sftp': {
      const pane = activePane(state)
      if (pane?.sessionId && pane.status === 'connected' && pane.kind === 'ssh') {
        state.setModal({ kind: 'sftp', sessionId: pane.sessionId, title: pane.title })
      } else {
        state.notify({ kind: 'info', title: 'SFTP needs a live SSH session' })
      }
      break
    }
    case 'close-tab':
      closeActiveTab()
      break
    case 'reconnect':
      reconnectActivePane()
      break
    case 'command-palette':
      state.setModal({ kind: 'palette' })
      break
    case 'shortcuts':
      state.setModal({ kind: 'help' })
      break
    default:
      break
  }
}
