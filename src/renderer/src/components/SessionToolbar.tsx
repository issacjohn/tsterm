import {
  Columns2,
  Copy,
  Eraser,
  FolderOpen,
  PanelRight,
  RefreshCw,
  Rows2,
  Search,
  Waypoints
} from 'lucide-react'
import { useAppStore, activePane, activeTab } from '../store'
import {
  deviceTypeForSession,
  openDeviceTypePickerForPane,
  reconnectPane,
  splitActivePane
} from '../lib/session-actions'
import { clearTerminal, copySelection, focusTerminal } from '../lib/terminal-registry'
import { cx, truncate } from '../lib/format'

interface SessionToolbarProps {
  onToggleTroubleshoot: () => void
}

export function SessionToolbar({ onToggleTroubleshoot }: SessionToolbarProps): React.JSX.Element | null {
  const state = useAppStore()
  const tab = activeTab(state)
  const pane = activePane(state)
  if (!tab || !pane) return null

  const deviceType = deviceTypeForSession(pane.sessionId) ??
    state.catalog.types.find((type) => type.id === pane.deviceTypeId)
  const connected = pane.status === 'connected'
  const ssh = pane.kind === 'ssh' && Boolean(pane.sessionId)
  const canSftp = ssh && connected
  const canForward = ssh && connected
  const statusLabel =
    pane.status === 'connected'
      ? 'Connected'
      : pane.status === 'pending'
        ? 'Connecting'
        : pane.status === 'error'
          ? 'Failed'
          : pane.status === 'disconnected'
            ? 'Disconnected'
            : 'Idle'

  const openSearch = (): void => {
    if (!pane.sessionId) return
    window.dispatchEvent(new CustomEvent('tsterm:find', { detail: { sessionId: pane.sessionId } }))
  }

  const doCopy = async (): Promise<void> => {
    const copied = await copySelection(pane.sessionId)
    if (!copied) {
      state.notify({ kind: 'info', title: 'Nothing selected', message: 'Select text in the terminal to copy it.' })
    }
  }

  return (
    <div className="session-toolbar">
      <div className="session-identity">
        <span className={`session-status ${pane.status}`} />
        <div className="session-title-block">
          <div className="session-title-line">
            <span className="session-title">{pane.title}</span>
            {deviceType ? (
              <button
                className="device-chip"
                onClick={() => {
                  if (pane.hostId) {
                    openDeviceTypePickerForPane(tab.id, pane.id, pane.deviceTypeId)
                  } else {
                    state.setModal({
                      kind: 'device-type',
                      current: pane.deviceTypeId,
                      tabId: tab.id,
                      paneId: pane.id,
                      title: pane.title
                    })
                  }
                }}
                title="Change device type"
              >
                <span className="device-vendor">{truncate(deviceType.vendor, 12)}</span>
                <span>{deviceType.name}</span>
              </button>
            ) : (
              <button
                className="device-chip missing"
                onClick={() => openDeviceTypePickerForPane(tab.id, pane.id, pane.deviceTypeId)}
                title="Choose a device type"
              >
                Choose device type
              </button>
            )}
            <span className={`connection-pill ${pane.status}`}>{statusLabel}</span>
          </div>
          <span className="session-subtitle">{pane.subtitle}</span>
        </div>
      </div>

      <div className="session-actions">
        <button
          className="icon-btn"
          title="Reconnect"
          disabled={pane.status === 'pending'}
          onClick={() => reconnectPane(tab.id, pane.id)}
        >
          <RefreshCw size={16} className={pane.status === 'pending' ? 'spin' : undefined} />
        </button>
        <button
          className="icon-btn"
          title="Split right"
          disabled={tab.panes.length > 1 || pane.status === 'pending'}
          onClick={() => splitActivePane('horizontal')}
        >
          <Columns2 size={16} />
        </button>
        <button
          className="icon-btn"
          title="Split down"
          disabled={tab.panes.length > 1 || pane.status === 'pending'}
          onClick={() => splitActivePane('vertical')}
        >
          <Rows2 size={16} />
        </button>
        <span className="toolbar-sep" />
        <button
          className="icon-btn"
          title="SFTP browser"
          disabled={!canSftp}
          onClick={() => {
            if (pane.sessionId) state.setModal({ kind: 'sftp', sessionId: pane.sessionId, title: pane.title })
          }}
        >
          <FolderOpen size={16} />
        </button>
        <button
          className="icon-btn"
          title="Port forwarding"
          disabled={!canForward}
          onClick={() => {
            if (pane.sessionId) state.setModal({ kind: 'forwards', sessionId: pane.sessionId, title: pane.title })
          }}
        >
          <Waypoints size={16} />
        </button>
        <span className="toolbar-sep" />
        <button className="icon-btn" title="Find in terminal (Ctrl+F)" disabled={!connected} onClick={openSearch}>
          <Search size={16} />
        </button>
        <button className="icon-btn" title="Copy selection (Ctrl+Shift+C)" disabled={!connected} onClick={() => void doCopy()}>
          <Copy size={16} />
        </button>
        <button
          className="icon-btn"
          title="Clear terminal"
          disabled={!connected}
          onClick={() => {
            clearTerminal(pane.sessionId)
            focusTerminal(pane.sessionId)
          }}
        >
          <Eraser size={16} />
        </button>
        <span className="toolbar-sep" />
        <button
          className={cx('icon-btn', state.showTroubleshoot && 'active-toggle')}
          title="Toggle troubleshooting panel"
          onClick={onToggleTroubleshoot}
        >
          <PanelRight size={16} />
        </button>
      </div>
    </div>
  )
}
