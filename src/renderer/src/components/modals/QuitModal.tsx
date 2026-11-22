import { AlertTriangle, Copy, Power, ShieldAlert } from 'lucide-react'
import type { DebugSession } from '@shared/types'
import { useAppStore } from '../../store'
import { Modal } from '../ui/Modal'

export function QuitModal({ sessions }: { sessions: DebugSession[] }): React.JSX.Element {
  const setModal = useAppStore((state) => state.setModal)
  const live = sessions.filter((session) => session.live).length
  const grouped = new Map<string, DebugSession[]>()
  for (const session of sessions) {
    const key = `${session.hostLabel}${session.hostname ? ` (${session.hostname})` : ''}`
    const list = grouped.get(key) ?? []
    list.push(session)
    grouped.set(key, list)
  }

  const finish = (action: 'stop' | 'force' | 'cancel'): void => {
    if (action === 'cancel') {
      setModal(null)
      void window.tsterm.app.quit('cancel')
      return
    }
    void window.tsterm.app.quit(action)
  }

  return (
    <Modal
      title="Debug sessions are still running"
      description="TSTerm tracks the debugs and captures it helped you start. Stopping them now avoids leaving verbose logging on the device."
      icon={<AlertTriangle size={20} />}
      size="lg"
      onClose={() => finish('cancel')}
      footer={
        <>
          <div className="modal-footer-left">
            <span className="quit-footnote">
              {live ? `${live} connected session${live === 1 ? '' : 's'} can be cleaned automatically.` : 'Cleanup commands will be copied to your clipboard.'}
            </span>
          </div>
          <div className="modal-footer-actions">
            <button className="btn" onClick={() => finish('cancel')}>
              Cancel
            </button>
            <button className="btn btn-danger-ghost" onClick={() => finish('force')}>
              <Power size={14} /> Quit without stopping
            </button>
            <button className="btn btn-primary" onClick={() => finish('stop')}>
              <ShieldAlert size={14} /> {live ? 'Stop debugs & quit' : 'Copy cleanup & quit'}
            </button>
          </div>
        </>
      }
    >
      <div className="quit-panel">
        <div className="quit-warning">
          <AlertTriangle size={16} />
          <div>
            <strong>{sessions.length} active debug session{sessions.length === 1 ? '' : 's'}</strong>
            <p>If you quit without cleanup, the device keeps generating debug output and may stay at high CPU.</p>
          </div>
        </div>
        <div className="quit-groups">
          {[...grouped.entries()].map(([host, list]) => (
            <div className="quit-group" key={host}>
              <div className="quit-group-head">
                <span className="status-dot connected" />
                {host}
                <span>{list.length}</span>
              </div>
              {list.map((session) => (
                <div className="quit-session" key={session.id}>
                  <div className="quit-session-head">
                    <strong>{session.workflowTitle}</strong>
                    <span className={`effect-badge effect-${session.effect}`}>{session.effect}</span>
                    <span className={`debug-mode ${session.live ? 'live' : ''}`}>
                      {session.live ? 'connected' : session.mode}
                    </span>
                  </div>
                  <div className="quit-cleanup">
                    <Copy size={12} />
                    <code>{session.cleanup.join(' · ') || 'No cleanup commands recorded'}</code>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="quit-caption">
          After cleanup, the commands are also copied to the clipboard and written to the TSTerm exports folder,
          so a disconnected device can be cleaned up manually.
        </p>
      </div>
    </Modal>
  )
}
