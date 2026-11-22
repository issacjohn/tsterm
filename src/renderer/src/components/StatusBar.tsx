import { Coffee, ShieldAlert, ShieldCheck, Wifi, WifiOff } from 'lucide-react'
import { useAppStore, activePane, activeTab } from '../store'
import { formatDuration } from '../lib/format'

export function StatusBar(): React.JSX.Element {
  const state = useAppStore()
  const tab = activeTab(state)
  const pane = activePane(state)
  const session = pane?.session
  const connected = pane?.status === 'connected'
  const debugCount = state.debugSessions.length
  const version = state.bootstrap?.appVersion ?? '0.1.0'

  return (
    <footer className="statusbar">
      <div className="status-left">
        {pane ? (
          <>
            <span className={`status-dot ${connected ? 'connected' : pane.status}`} />
            {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span className="status-host">{pane.title}</span>
            {session?.subtitle ? <span className="status-sub">{session.subtitle}</span> : null}
            {connected && session?.connectedAt ? (
              <span className="status-duration">{formatDuration(session.connectedAt)}</span>
            ) : null}
            {tab && tab.panes.length > 1 ? <span className="status-badge">split</span> : null}
          </>
        ) : (
          <>
            <span className="status-dot idle" />
            <span className="status-host">Ready</span>
            <span className="status-sub">Connect a device to start troubleshooting</span>
          </>
        )}
      </div>

      <div className="status-center">
        <button
          className={`status-debug${debugCount ? ' active' : ''}`}
          onClick={() => state.setModal({ kind: 'debug' })}
          title="Review debug sessions and cleanup commands"
        >
          {debugCount ? <ShieldAlert size={13} /> : <ShieldCheck size={13} />}
          {debugCount
            ? `${debugCount} debug session${debugCount === 1 ? '' : 's'} tracked`
            : 'No active debug sessions'}
        </button>
      </div>

      <div className="status-right">
        {state.settings.inlineSuggestions ? (
          <span className="status-hint" title="Inline next-word suggestions from the command catalog">
            <kbd>Tab</kbd> accept suggestion
          </span>
        ) : null}
        <button
          className="status-link"
          onClick={() => state.setModal({ kind: 'settings', tab: 'appearance' })}
          title="Terminal font size"
        >
          {state.settings.fontSize}px
        </button>
        <span className="status-encoding">UTF-8</span>
        <span className="status-version">v{version}</span>
        <button
          className="bmac-link"
          onClick={() => void window.tsterm.app.openExternal('https://buymeacoffee.com/issac_john')}
          title="Buy me a coffee"
          aria-label="Buy me a coffee"
        >
          <Coffee size={14} />
          <span>buy me a coffee</span>
        </button>
      </div>
    </footer>
  )
}
