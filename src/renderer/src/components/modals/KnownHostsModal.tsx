import { Fingerprint, KeyRound, ShieldCheck, Trash2 } from 'lucide-react'
import { useAppStore } from '../../store'
import { Modal } from '../ui/Modal'

export function KnownHostsModal(): React.JSX.Element {
  const knownHosts = useAppStore((state) => state.knownHosts)
  const setKnownHosts = useAppStore((state) => state.setKnownHosts)
  const setModal = useAppStore((state) => state.setModal)
  const notify = useAppStore((state) => state.notify)
  const settings = useAppStore((state) => state.settings)

  const remove = async (id: string, label: string): Promise<void> => {
    if (!window.confirm(`Forget the host key for ${label}?\n\nYou will be asked to verify it on the next connection.`)) return
    try {
      const next = await window.tsterm.knownHosts.remove(id)
      setKnownHosts(next)
      notify({ kind: 'success', title: 'Host key forgotten', message: label })
    } catch (error) {
      notify({ kind: 'error', title: 'Could not remove host key', message: (error as Error).message })
    }
  }

  const copy = async (fingerprint: string): Promise<void> => {
    await window.tsterm.app.copyText(fingerprint)
    notify({ kind: 'success', title: 'Fingerprint copied' })
  }

  return (
    <Modal
      title="Known hosts"
      description="TSTerm trusts a host key once you verify its SHA-256 fingerprint. Saved keys make later connections silent."
      icon={<Fingerprint size={20} />}
      size="lg"
      onClose={() => setModal(null)}
      footer={
        <>
          <div className="modal-footer-left">
            <button className="btn btn-ghost btn-sm" onClick={() => setModal({ kind: 'settings', tab: 'sessions' })}>
              <ShieldCheck size={14} /> Trust settings
            </button>
          </div>
          <div className="modal-footer-actions">
            <button className="btn" onClick={() => setModal(null)}>
              Close
            </button>
          </div>
        </>
      }
    >
      <div className="known-hosts-panel">
        <div className={`trust-banner ${settings.strictHostKeyChecking ? 'strict' : 'relaxed'}`}>
          <ShieldCheck size={15} />
          <div>
            <strong>
              {settings.strictHostKeyChecking ? 'Strict host key checking is on' : 'Strict host key checking is off'}
            </strong>
            <p>
              {settings.strictHostKeyChecking
                ? 'A changed fingerprint blocks the connection until you explicitly replace it.'
                : 'TSTerm accepts any host key. This is convenient for a lab, but weakens protection.'}
            </p>
          </div>
        </div>

        {knownHosts.length === 0 ? (
          <div className="known-empty">
            <KeyRound size={22} />
            <strong>No trusted hosts yet</strong>
            <p>On the first connection to a new device, TSTerm asks you to verify its fingerprint.</p>
          </div>
        ) : (
          <div className="known-list">
            {knownHosts
              .slice()
              .sort((a, b) => a.hostname.localeCompare(b.hostname))
              .map((host) => (
                <div className="known-row" key={host.id}>
                  <div className="known-icon">
                    <KeyRound size={15} />
                  </div>
                  <div className="known-copy">
                    <div className="known-title">
                      {host.hostname}
                      <span>:{host.port}</span>
                      {host.keyType ? <em>{host.keyType}</em> : null}
                    </div>
                    <button className="known-fingerprint" onClick={() => void copy(host.fingerprint)} title="Copy fingerprint">
                      {host.fingerprint}
                    </button>
                    <small>Added {new Date(host.addedAt).toLocaleDateString()}</small>
                  </div>
                  <button
                    className="icon-btn danger"
                    title="Forget host key"
                    onClick={() => void remove(host.id, `${host.hostname}:${host.port}`)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
          </div>
        )}
        <div className="known-tip">
          If a device was rebuilt, its host key changes. Verify the new fingerprint on the device console before
          replacing it here.
        </div>
      </div>
    </Modal>
  )
}
