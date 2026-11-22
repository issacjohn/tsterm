import { useEffect, useState } from 'react'
import { ArrowRight, Link2, Play, Square, Waypoints } from 'lucide-react'
import type { PortForward } from '@shared/types'
import { useAppStore } from '../../store'
import { Modal } from '../ui/Modal'

export function ForwardsModal({ sessionId, title }: { sessionId: string; title: string }): React.JSX.Element {
  const setModal = useAppStore((state) => state.setModal)
  const notify = useAppStore((state) => state.notify)
  const [forwards, setForwards] = useState<PortForward[]>([])
  const [remoteHost, setRemoteHost] = useState('127.0.0.1')
  const [remotePort, setRemotePort] = useState('22')
  const [localPort, setLocalPort] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    try {
      setForwards(await window.tsterm.forwards.list(sessionId))
    } catch (listError) {
      setError((listError as Error).message)
    }
  }

  useEffect(() => {
    void refresh()
    const unsubscribe = window.tsterm.forwards.onChanged((forward) => {
      if (forward.terminalId !== sessionId) return
      setForwards((current) => {
        const exists = current.some((item) => item.id === forward.id)
        if (forward.status === 'stopped') return current.filter((item) => item.id !== forward.id)
        return exists ? current.map((item) => (item.id === forward.id ? forward : item)) : [...current, forward]
      })
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const start = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const forward = await window.tsterm.forwards.start(
        sessionId,
        remoteHost.trim(),
        Number(remotePort),
        localPort.trim() ? Number(localPort) : 0
      )
      setForwards((current) => [...current.filter((item) => item.id !== forward.id), forward])
      notify({
        kind: 'success',
        title: 'Tunnel started',
        message: `127.0.0.1:${forward.localPort} → ${forward.remoteHost}:${forward.remotePort}`
      })
    } catch (startError) {
      setError((startError as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const stop = async (id: string): Promise<void> => {
    try {
      await window.tsterm.forwards.stop(id)
      setForwards((current) => current.filter((item) => item.id !== id))
    } catch (stopError) {
      setError((stopError as Error).message)
    }
  }

  return (
    <Modal
      title="Port forwarding"
      description={`${title} — local tunnels over this SSH connection.`}
      icon={<Waypoints size={20} />}
      size="lg"
      onClose={() => setModal(null)}
      footer={
        <>
          <div className="modal-footer-left">
            <span className="sftp-footnote">Keep TSTerm open while the tunnel is active.</span>
          </div>
          <div className="modal-footer-actions">
            <button className="btn" onClick={() => setModal(null)}>
              Close
            </button>
          </div>
        </>
      }
    >
      <div className="forward-panel">
        <div className="forward-form">
          <div className="form-grid forward-grid">
            <label className="field">
              <span>Remote host</span>
              <input value={remoteHost} onChange={(event) => setRemoteHost(event.target.value)} placeholder="127.0.0.1" />
            </label>
            <label className="field">
              <span>Remote port</span>
              <input type="number" min={1} max={65535} value={remotePort} onChange={(event) => setRemotePort(event.target.value)} />
            </label>
            <label className="field">
              <span>Local port</span>
              <input
                type="number"
                min={0}
                max={65535}
                value={localPort}
                onChange={(event) => setLocalPort(event.target.value)}
                placeholder="Auto"
              />
            </label>
            <button className="btn btn-primary forward-start" onClick={() => void start()} disabled={busy}>
              <Play size={14} /> {busy ? 'Starting…' : 'Start tunnel'}
            </button>
          </div>
          <p className="forward-help">
            Binds to <code>127.0.0.1</code>. Leave the local port empty to let the OS pick one.
          </p>
        </div>

        {error ? <div className="form-error-banner">{error}</div> : null}

        <div className="forward-list">
          {forwards.length === 0 ? (
            <div className="forward-empty">
              <Link2 size={22} />
              <strong>No active tunnels</strong>
              <p>Forward a database, web UI, or management port from the remote network.</p>
            </div>
          ) : (
            forwards.map((forward) => (
              <div className={`forward-row status-${forward.status}`} key={forward.id}>
                <div className="forward-route">
                  <span className="forward-local">127.0.0.1:{forward.localPort}</span>
                  <ArrowRight size={14} />
                  <span>
                    {forward.remoteHost}:{forward.remotePort}
                  </span>
                </div>
                <span className={`forward-status ${forward.status}`}>{forward.status}</span>
                <button className="btn btn-sm" onClick={() => void stop(forward.id)}>
                  <Square size={12} /> Stop
                </button>
                {forward.error ? <span className="forward-error">{forward.error}</span> : null}
              </div>
            ))
          )}
        </div>
        <div className="forward-note">
          Local forwards are only reachable from this computer. Do not expose them on a public interface.
        </div>
      </div>
    </Modal>
  )
}
