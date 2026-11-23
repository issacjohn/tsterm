import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  Braces,
  Coffee,
  FolderKey,
  FolderOpen,
  Keyboard,
  Laptop,
  PanelLeft,
  PanelRight,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Waypoints,
  Wrench
} from 'lucide-react'
import { useAppStore, activePane, activeTab } from '../../store'
import {
  connectHost,
  openHostEditor,
  openLocalTerminal,
  saveSettings
} from '../../lib/session-actions'
import { Modal } from '../ui/Modal'
import { cx, truncate } from '../../lib/format'

interface PaletteAction {
  id: string
  label: string
  category: string
  keywords: string
  icon: typeof Search
  shortcut?: string
  run: () => void | Promise<void>
}

export function CommandPalette(): React.JSX.Element {
  const state = useAppStore()
  const hosts = state.hosts
  const pane = activePane(state)
  const tab = activeTab(state)
  const debugCount = state.debugSessions.length
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const actions = useMemo<PaletteAction[]>(() => {
    const list: PaletteAction[] = [
      {
        id: 'new-ssh',
        label: 'New SSH connection',
        category: 'Session',
        keywords: 'connect host device ssh new',
        icon: Plus,
        shortcut: 'Ctrl Shift N',
        run: () => openHostEditor()
      },
      {
        id: 'local',
        label: 'Open a local terminal',
        category: 'Session',
        keywords: 'shell powershell zsh bash local',
        icon: Laptop,
        shortcut: 'Ctrl Shift T',
        run: () => openLocalTerminal()
      },
      {
        id: 'settings',
        label: 'Open settings',
        category: 'Application',
        keywords: 'font theme colors settings preferences',
        icon: Settings,
        shortcut: 'Ctrl ,',
        run: () => state.setModal({ kind: 'settings' })
      },
      {
        id: 'toggle-sidebar',
        label: state.showSidebar ? 'Hide device sidebar' : 'Show device sidebar',
        category: 'View',
        keywords: 'sidebar hosts layout',
        icon: PanelLeft,
        run: () => saveSettings({ showSidebar: !state.showSidebar })
      },
      {
        id: 'toggle-troubleshoot',
        label: state.showTroubleshoot ? 'Hide troubleshooting panel' : 'Show troubleshooting panel',
        category: 'View',
        keywords: 'runbooks commands troubleshoot panel',
        icon: PanelRight,
        shortcut: 'Ctrl Shift K',
        run: () => saveSettings({ showTroubleshootPanel: !state.showTroubleshoot })
      },
      {
        id: 'ai-assistant',
        label: state.settings.aiEnabled ? 'Open AI assistant' : 'Set up AI assistant',
        category: 'Assistant',
        keywords: 'ai chat troubleshoot local ollama lm studio provider openai anthropic',
        icon: Bot,
        shortcut: 'Ctrl Shift A',
        run: () => {
          if (!state.settings.aiEnabled) {
            state.setModal({ kind: 'settings', tab: 'ai' })
            return
          }
          saveSettings({ showTroubleshootPanel: true })
          state.setTroubleshootTab('assistant')
        }
      },
      {
        id: 'snippets',
        label: 'Open snippets',
        category: 'Library',
        keywords: 'commands save reuse',
        icon: Sparkles,
        run: () => state.setModal({ kind: 'snippets' })
      },
      {
        id: 'debug',
        label: `Open debug guard${debugCount ? ` (${debugCount})` : ''}`,
        category: 'Safety',
        keywords: 'cleanup undebug capture stop',
        icon: ShieldCheck,
        shortcut: 'Ctrl Shift D',
        run: () => state.setModal({ kind: 'debug' })
      },
      {
        id: 'known-hosts',
        label: 'Known hosts and fingerprints',
        category: 'Safety',
        keywords: 'host key fingerprint trust ssh',
        icon: FolderKey,
        run: () => state.setModal({ kind: 'known-hosts' })
      },
      {
        id: 'new-pack',
        label: 'Create a device type',
        category: 'Library',
        keywords: 'catalog pack json custom device',
        icon: Braces,
        run: () => state.setModal({ kind: 'new-device-type' })
      },
      {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        category: 'Help',
        keywords: 'help keys documentation',
        icon: Keyboard,
        shortcut: 'F1',
        run: () => state.setModal({ kind: 'help' })
      },
      {
        id: 'update',
        label: 'Check for updates',
        category: 'Help',
        keywords: 'version upgrade github release',
        icon: RefreshCw,
        run: async () => {
          const result = await window.tsterm.updates.check(true)
          if (result.available && result.update) {
            state.setModal({ kind: 'update', info: result.update, manual: true })
          } else {
            state.notify({
              kind: 'info',
              title: result.checked ? 'TSTerm is up to date' : 'Update check',
              message: result.reason || `You are on the latest version (${state.bootstrap?.appVersion ?? '0.1.0'}).`
            })
          }
        }
      },
      {
        id: 'coffee',
        label: 'Buy me a coffee',
        category: 'Help',
        keywords: 'support donate coffee',
        icon: Coffee,
        run: () => window.tsterm.app.openExternal('https://buymeacoffee.com/issac_john')
      }
    ]

    if (pane?.sessionId && pane.status === 'connected' && pane.kind === 'ssh') {
      list.splice(5, 0, {
        id: 'sftp',
        label: 'Open SFTP browser',
        category: 'Session',
        keywords: 'files upload download sftp',
        icon: FolderOpen,
        shortcut: 'Ctrl Shift S',
        run: () => state.setModal({ kind: 'sftp', sessionId: pane.sessionId!, title: pane.title })
      })
      list.splice(6, 0, {
        id: 'forwards',
        label: 'Port forwarding',
        category: 'Session',
        keywords: 'tunnel local port forward',
        icon: Waypoints,
        run: () => state.setModal({ kind: 'forwards', sessionId: pane.sessionId!, title: pane.title })
      })
    }
    if (pane) {
      list.splice(2, 0, {
        id: 'device-type',
        label: 'Change the device type',
        category: 'Session',
        keywords: 'platform runbooks switch',
        icon: Server,
        run: () => {
          if (tab) state.setModal({
            kind: 'device-type',
            hostId: pane.hostId,
            tabId: tab.id,
            paneId: pane.id,
            current: pane.deviceTypeId,
            title: pane.title
          })
        }
      })
    }

    for (const host of hosts.slice(0, 8)) {
      list.push({
        id: `host-${host.id}`,
        label: `Connect to ${truncate(host.label, 34)}`,
        category: 'Devices',
        keywords: `${host.hostname} ${host.username} ${host.group ?? ''} ${host.deviceType ?? ''}`,
        icon: Server,
        run: () => connectHost(host.id)
      })
    }
    return list
  }, [debugCount, hosts, pane, state, tab])

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return actions
    const tokens = value.split(/\s+/)
    return actions.filter((action) => {
      const haystack = `${action.label} ${action.category} ${action.keywords}`.toLowerCase()
      return tokens.every((token) => haystack.includes(token))
    })
  }, [actions, query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => setIndex(0), [query])

  const execute = (action: PaletteAction): void => {
    state.setModal(null)
    window.setTimeout(() => {
      void action.run()
    }, 0)
  }

  const runSelected = (): void => {
    if (filtered[index]) execute(filtered[index])
  }

  return (
    <Modal
      title="Command palette"
      description="Jump to a host, open a tool, or change the workspace."
      icon={<Wrench size={20} />}
      size="md"
      onClose={() => state.setModal(null)}
      className="palette-modal"
      footer={
        <>
          <span className="palette-hint">
            <kbd>↑</kbd><kbd>↓</kbd> navigate
            <span>·</span>
            <kbd>Enter</kbd> run
            <span>·</span>
            <kbd>Esc</kbd> close
          </span>
          <span className="palette-count">{filtered.length} actions</span>
        </>
      }
    >
      <div className="palette">
        <div className="palette-search">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setIndex((current) => Math.min(filtered.length - 1, current + 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setIndex((current) => Math.max(0, current - 1))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                runSelected()
              }
            }}
            placeholder="Type a command, host, or setting…"
            aria-label="Command palette search"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list">
          {filtered.length === 0 ? (
            <div className="palette-empty">
              <Search size={20} />
              <strong>No matches</strong>
              <p>Try “SSH”, “font”, “debug”, or a hostname.</p>
            </div>
          ) : (
            filtered.map((action, actionIndex) => {
              const Icon = action.icon
              return (
                <button
                  key={action.id}
                  className={cx('palette-row', actionIndex === index && 'selected')}
                  onMouseEnter={() => setIndex(actionIndex)}
                  onClick={() => execute(action)}
                >
                  <span className="palette-row-icon">
                    <Icon size={16} />
                  </span>
                  <span className="palette-row-label">{action.label}</span>
                  <span className="palette-row-category">{action.category}</span>
                  {action.shortcut ? <kbd>{action.shortcut}</kbd> : null}
                </button>
              )
            })
          )}
        </div>
      </div>
    </Modal>
  )
}
