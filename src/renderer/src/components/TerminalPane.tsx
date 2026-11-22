import { AlertTriangle, Loader2, Pencil, RefreshCw, ServerOff, X } from 'lucide-react'
import { useAppStore, type PaneState } from '../store'
import { closeTab, openHostEditor, reconnectPane } from '../lib/session-actions'
import { TerminalView } from './TerminalView'
import { cx } from '../lib/format'

interface TerminalPaneProps {
  tabId: string
  pane: PaneState
  active: boolean
  split: boolean
}

export function TerminalPane({ tabId, pane, active, split }: TerminalPaneProps): React.JSX.Element {
  const setActivePane = useAppStore((state) => state.setActivePane)
  const notify = useAppStore((state) => state.notify)
  const deviceType = useAppStore((state) => state.catalog.types.find((type) => type.id === pane.deviceTypeId))

  const disconnected = pane.status === 'disconnected' || pane.status === 'error'

  return (
    <section
      className={cx('session-pane', active && 'active-pane', split && 'split-pane')}
      onMouseDown={() => setActivePane(tabId, pane.id)}
      aria-label={pane.title}
    >
      {split ? (
        <div className="pane-chrome">
          <span className={`session-status ${pane.status}`} />
          <span className="pane-title">{pane.title}</span>
          <span className="pane-type">{deviceType?.name}</span>
          <button
            className="icon-btn tiny"
            title="Close tab"
            onClick={(event) => {
              event.stopPropagation()
              closeTab(tabId)
            }}
          >
            <X size={13} />
          </button>
        </div>
      ) : null}

      {pane.session ? (
        <>
          <TerminalView session={pane.session} deviceTypeId={pane.deviceTypeId} active={active} />
          {disconnected ? (
            <div className="disconnect-banner">
              <div className="disconnect-copy">
                <ServerOff size={15} />
                <span>
                  {pane.status === 'error'
                    ? pane.error || 'The session ended with an error.'
                    : 'The session was closed by the remote device.'}
                </span>
              </div>
              <div className="disconnect-actions">
                <button className="btn btn-sm btn-primary" onClick={() => reconnectPane(tabId, pane.id)}>
                  <RefreshCw size={13} /> Reconnect
                </button>
                <button className="btn btn-sm" onClick={() => closeTab(tabId)}>
                  Close
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="terminal-placeholder">
          {pane.status === 'pending' ? (
            <>
              <div className="placeholder-radar">
                <span className="radar-ring" />
                <span className="radar-ring delay" />
                <Loader2 size={24} className="spin" />
              </div>
              <h3>Opening a secure channel</h3>
              <p>
                Connecting to <strong>{pane.title}</strong>
                {pane.subtitle ? ` · ${pane.subtitle}` : ''}
              </p>
              <div className="placeholder-actions">
                <button className="btn btn-sm" onClick={() => closeTab(tabId)}>
                  Cancel
                </button>
              </div>
              <div className="placeholder-footnote">Host key verification and authentication happen before any command is sent.</div>
            </>
          ) : (
            <>
              <div className="placeholder-icon error">
                <AlertTriangle size={24} />
              </div>
              <h3>{pane.error ? 'Connection failed' : 'Session not started'}</h3>
              <p>{pane.error || 'This session is idle.'}</p>
              <div className="placeholder-actions">
                <button className="btn btn-sm btn-primary" onClick={() => reconnectPane(tabId, pane.id)}>
                  <RefreshCw size={14} /> Try again
                </button>
                {pane.hostId ? (
                  <button
                    className="btn btn-sm"
                    onClick={() => openHostEditor(pane.hostId)}
                  >
                    <Pencil size={14} /> Edit host
                  </button>
                ) : null}
                <button className="btn btn-sm" onClick={() => closeTab(tabId)}>
                  Close
                </button>
              </div>
              {pane.error?.toLowerCase().includes('host key') ? (
                <button
                  className="link-button"
                  onClick={() =>
                    notify({
                      kind: 'info',
                      title: 'Host key changed',
                      message: 'Open Known hosts to review and remove the stored fingerprint, then reconnect.'
                    })
                  }
                >
                  Review known hosts
                </button>
              ) : null}
            </>
          )}
        </div>
      )}
    </section>
  )
}
