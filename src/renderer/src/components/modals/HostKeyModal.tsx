import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, Fingerprint, ShieldAlert } from 'lucide-react'
import type { ConnectError } from '@shared/types'
import type { PendingConnect } from '../../store'
import { useAppStore } from '../../store'
import { cancelPendingConnect, trustHostKey } from '../../lib/session-actions'
import { Modal } from '../ui/Modal'

interface HostKeyModalProps {
  pending: PendingConnect
  error: ConnectError
}

export function HostKeyModal({ pending, error }: HostKeyModalProps): React.JSX.Element {
  const hosts = useAppStore((state) => state.hosts)
  const notify = useAppStore((state) => state.notify)
  const [busy, setBusy] = useState(false)
  const target = hosts.find((host) => host.id === pending.hostId)
  const jump = hosts.find((host) => host.id === target?.jumpHostId)
  const isJump = Boolean(jump && error.hostname === jump.hostname)
  const mismatch = error.code === 'HOST_KEY_MISMATCH'
  const deviceLabel = isJump ? `jump host ${jump?.label}` : target?.label ?? error.hostname

  const trust = async (): Promise<void> => {
    setBusy(true)
    try {
      await trustHostKey(pending, error)
    } finally {
      setBusy(false)
    }
  }

  const copy = async (): Promise<void> => {
    if (!error.fingerprint) return
    await window.tsterm.app.copyText(error.fingerprint)
    notify({ kind: 'success', title: 'Fingerprint copied' })
  }

  return (
    <Modal
      title={mismatch ? 'Host key has changed' : 'Verify host identity'}
      description={`${deviceLabel} · ${error.hostname ?? target?.hostname ?? ''}:${error.port ?? target?.port ?? 22}`}
      icon={mismatch ? <ShieldAlert size={20} /> : <Fingerprint size={20} />}
      size="md"
      onClose={() => cancelPendingConnect(pending)}
      footer={
        <>
          <div className="modal-footer-left">
            <span className="quit-footnote">The key is checked again on every new connection.</span>
          </div>
          <div className="modal-footer-actions">
            <button className="btn" onClick={() => cancelPendingConnect(pending)} disabled={busy}>
              Cancel
            </button>
            <button className={mismatch ? 'btn btn-danger' : 'btn btn-primary'} onClick={() => void trust()} disabled={busy}>
              {mismatch ? 'Replace key & connect' : 'Trust & connect'}
            </button>
          </div>
        </>
      }
    >
      <div className={`hostkey-panel${mismatch ? ' mismatch' : ''}`}>
        <div className="hostkey-banner">
          {mismatch ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}
          <div>
            <strong>{mismatch ? 'The fingerprint does not match the saved key.' : 'This is the first time you are connecting.'}</strong>
            <p>
              {mismatch
                ? 'This can happen after a device rebuild or replacement, but it can also indicate interception. Verify the fingerprint on the device before replacing it.'
                : 'Verify this fingerprint through a trusted channel, the console, or the device itself before continuing.'}
            </p>
          </div>
        </div>

        <div className="fingerprint-card">
          <span>SHA-256 fingerprint</span>
          <code>{error.fingerprint ?? 'Not available'}</code>
          <div className="fingerprint-meta">
            <span>{error.keyType ?? 'unknown key type'}</span>
            <button className="text-link" onClick={() => void copy()}>
              <Copy size={12} /> Copy
            </button>
          </div>
        </div>

        {error.message ? <p className="hostkey-detail">{error.message}</p> : null}

        <div className="hostkey-tip">
          On a Cisco ASA, compare this with <code>show ssh</code> or the key shown in ASDM. On Linux, use{' '}
          <code>ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub</code>.
        </div>
      </div>
    </Modal>
  )
}
