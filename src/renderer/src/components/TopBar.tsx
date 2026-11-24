import { useState } from 'react'
import {
  Command,
  PanelLeft,
  RefreshCw,
  Settings,
  ShieldAlert,
  TerminalSquare
} from 'lucide-react'
import { useAppStore } from '../store'
import { checkForUpdates } from '../lib/updates'
import { cx, modifierLabel } from '../lib/format'
import { Logo } from './ui/Logo'

interface TopBarProps {
  onToggleSidebar: () => void
  onOpenSettings: () => void
  onOpenPalette: () => void
  onOpenDebug: () => void
}

export function TopBar({
  onToggleSidebar,
  onOpenSettings,
  onOpenPalette,
  onOpenDebug
}: TopBarProps): React.JSX.Element {
  const debugSessions = useAppStore((state) => state.debugSessions)
  const tabs = useAppStore((state) => state.tabs)
  const platform = useAppStore((state) => state.appPlatform)
  const appVersion = useAppStore((state) => state.bootstrap?.appVersion ?? '0.0.0')
  const [checking, setChecking] = useState(false)
  const connected = tabs.reduce(
    (count, tab) => count + tab.panes.filter((pane) => pane.status === 'connected').length,
    0
  )
  const mod = modifierLabel(platform)

  const checkUpdates = async (): Promise<void> => {
    setChecking(true)
    try {
      await checkForUpdates(true)
    } finally {
      setChecking(false)
    }
  }

  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <div className="brand-copy">
          <span className="wordmark">
            TS<span>Term</span>
          </span>
          <span className="brand-sub">Network operations console</span>
        </div>
      </div>

      <button className="command-trigger" onClick={onOpenPalette} title={`Open command palette (${mod}+Shift+P)`}>
        <Command size={15} />
        <span>Search devices, commands, runbooks…</span>
        <span className="shortcut">
          <kbd>{mod}</kbd>
          <kbd>⇧</kbd>
          <kbd>P</kbd>
        </span>
      </button>

      <div className="topbar-actions">
        <span className={`connection-count${connected ? ' live' : ''}`} title={`${connected} live session${connected === 1 ? '' : 's'}`}>
          <TerminalSquare size={13} />
          <span>{connected || '0'}</span>
          {connected ? <em>live</em> : null}
        </span>

        {debugSessions.length > 0 ? (
          <button className="debug-chip" onClick={onOpenDebug} title="Review active debug sessions">
            <ShieldAlert size={13} />
            <span>{debugSessions.length}</span>
            <span className="debug-label">debug{debugSessions.length === 1 ? '' : 's'}</span>
          </button>
        ) : (
          <button className="icon-btn" onClick={onOpenDebug} title="Debug session guard" aria-label="Debug session guard">
            <ShieldAlert size={17} />
          </button>
        )}

        <div className="topbar-version" title={`TSTerm version ${appVersion}`}>
          <span>v{appVersion}</span>
          <button
            className="icon-btn tiny"
            onClick={() => void checkUpdates()}
            disabled={checking}
            title="Check for updates"
            aria-label="Check for updates"
          >
            <RefreshCw size={12} className={cx(checking && 'spin')} />
          </button>
        </div>
        <span className="topbar-sep" />
        <button
          className="icon-btn"
          onClick={onToggleSidebar}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
        >
          <PanelLeft size={17} />
        </button>
        <button
          className="icon-btn"
          onClick={onOpenSettings}
          title={`Settings (${mod}+,)`}
          aria-label="Settings"
        >
          <Settings size={17} />
        </button>
      </div>
    </header>
  )
}
