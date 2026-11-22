import { useState } from 'react'
import { CheckCircle2, ClipboardCopy, ShieldCheck, Square, StopCircle, Trash2 } from 'lucide-react'
import type { DebugStopResult } from '@shared/types'
import { useAppStore } from '../../store'
import { Modal } from '../ui/Modal'
import { formatDuration } from '../../lib/format'

export function DebugModal(): React.JSX.Element {
  const sessions = useAppStore((state) => state.debugSessions)
  const setDebugSessions = useAppStore((state) => state.setDebugSessions)
  const notify = useAppStore((state) => state.notify)
  const setModal = useAppStore((state) => state.setModal)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DebugStopResult | null>(null)

  const stop = async (ids: string[]): Promise<void> => {
    if (!ids.length) return
    setBusy(true)
    try {
      const stopResult = await window.tsterm.debug.stop(ids)
      setDebugSessions(stopResult.sessions)
      setResult(stopResult)
      notify({
        kind: stopResult.stoppedLive ? 'success' : 'info',
        title: stopResult.stoppedLive ? 'Cleanup sent' : 'Cleanup copied',
        message: stopResult.stoppedLive
          ? `${stopResult.stoppedLive} live session${stopResult.stoppedLive === 1 ? '' : 's'} received the cleanup.`
          : 'Paste the cleanup commands into the device.',
        duration: 6000
      })
    } catch (error) {
      notify({ kind: 'error', title: 'Could not stop session', message: (error as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const clear = async (ids: string[]): Promise<void> => {
    setBusy(true)
    try {
      const next = await window.tsterm.debug.clear(ids)
      setDebugSessions(next)
      notify({ kind: 'info', title: 'Marked as stopped', message: 'No commands were sent.' })
    } finally {
      setBusy(false)
    }
  }

  const copyCleanup = async (): Promise<void> => {
    const text = sessions
      .map((session) => {
        const where = session.hostname ? `${session.hostLabel} (${session.hostname})` : session.hostLabel
        return `# ${where} — ${session.workflowTitle}\n${session.cleanup.join('\n')}`
      })
      .join('\n\n')
    await window.tsterm.app.copyText(text || '# No active debug sessions')
    notify({ kind: 'success', title: 'Cleanup copied' })
  }

  const clearAll = async (): Promise<void> => {
    if (!window.confirm('Clear all debug records?\n\nNo commands will be sent to any device.')) return
    await clear(sessions.map((session) => session.id))
  }

  return (
    <Modal
      title="Debug guard"
      description="Debugs and captures started from TSTerm stay here until you stop them or mark them stopped."
      icon={<ShieldCheck size={20} />}
      size="lg"
      onClose={() => setModal(null)}
      footer={
        <>
          <div className="modal-footer-left">
            {sessions.length ? (
              <button className="btn btn-ghost btn-sm" onClick={() => void clearAll()} disabled={busy}>
                <Trash2 size={14} /> Mark all stopped
              </button>
            ) : (
              <span className="quit-footnote">Nothing to clean up.</span>
            )}
          </div>
          <div className="modal-footer-actions">
            {sessions.length ? (
              <>
                <button className="btn" onClick={() => void copyCleanup()} disabled={busy}>
                  <ClipboardCopy size={14} /> Copy cleanup
                </button>
                <button className="btn btn-primary" onClick={() => void stop(sessions.map((session) => session.id))} disabled={busy}>
                  <StopCircle size={14} /> Stop all & copy cleanup
                </button>
              </>
            ) : null}
            <button className="btn" onClick={() => setModal(null)}>
              Close
            </button>
          </div>
        </>
      }
    >
      <div className="debug-panel">
        {sessions.length === 0 ? (
          <div className="debug-empty">
            <div className="debug-empty-icon">
              <CheckCircle2 size={24} />
            </div>
            <h3>No debug sessions tracked</h3>
            <p>
              When you send or copy a debug or packet-capture runbook, TSTerm records it here and offers the
              cleanup commands when you quit.
            </p>
          </div>
        ) : (
          <>
            <div className="debug-summary">
              <div>
                <strong>{sessions.length}</strong>
                <span>active</span>
              </div>
              <div>
                <strong>{sessions.filter((session) => session.live).length}</strong>
                <span>connected</span>
              </div>
              <div>
                <strong>{sessions.filter((session) => session.mode === 'copied').length}</strong>
                <span>copied</span>
              </div>
            </div>
            <div className="debug-list">
              {sessions.map((session) => (
                <div className="debug-session" key={session.id}>
                  <div className="debug-session-main">
                    <div className={`debug-dot ${session.live ? 'live' : ''}`}>
                      <Square size={10} />
                    </div>
                    <div className="debug-session-copy">
                      <div className="debug-session-title">
                        <strong>{session.workflowTitle}</strong>
                        <span className={`effect-badge effect-${session.effect}`}>{session.effect}</span>
                        <span className={`debug-mode ${session.live ? 'live' : ''}`}>
                          {session.live ? 'connected' : session.mode}
                        </span>
                      </div>
                      <div className="debug-session-meta">
                        {session.deviceTypeName ?? 'Device'} · {session.hostLabel}
                        {session.hostname ? ` (${session.hostname})` : ''} · {formatDuration(session.startedAt)}
                      </div>
                      <div className="debug-session-cleanup">
                        <code>{session.cleanup.join(' · ') || 'No cleanup commands recorded'}</code>
                      </div>
                    </div>
                    <div className="debug-session-actions">
                      <button className="btn btn-sm" onClick={() => void stop([session.id])} disabled={busy}>
                        <StopCircle size={13} /> Stop
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => void clear([session.id])} disabled={busy}>
                        Mark stopped
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {result ? (
          <div className="debug-result">
            <CheckCircle2 size={14} />
            <div>
              <strong>{result.cleared} session{result.cleared === 1 ? '' : 's'} cleared</strong>
              <span>
                {result.stoppedLive} sent automatically{result.cleared - result.stoppedLive > 0 ? `, ${result.cleared - result.stoppedLive} need manual cleanup` : ''}.
                {result.copied ? ' Cleanup copied to the clipboard.' : ''}
              </span>
              {result.cleanupFile ? (
                <button className="text-link" onClick={() => void window.tsterm.app.revealPath(result.cleanupFile!)}>
                  Show cleanup file
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="debug-note">
          <ShieldCheck size={13} />
          <span>
            “Mark stopped” only clears the record. Use it when you already ran the cleanup yourself. Stopping a
            disconnected session copies the commands because TSTerm cannot reach the device.
          </span>
        </div>
      </div>
    </Modal>
  )
}
