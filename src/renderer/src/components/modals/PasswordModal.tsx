import { useState } from 'react'
import { Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'
import type { PendingConnect } from '../../store'
import { useAppStore } from '../../store'
import { submitPassword, cancelPendingConnect } from '../../lib/session-actions'
import { Modal } from '../ui/Modal'

interface PasswordModalProps {
  pending: PendingConnect
  error?: string
}

export function PasswordModal({ pending, error }: PasswordModalProps): React.JSX.Element {
  const hosts = useAppStore((state) => state.hosts)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const host = hosts.find((item) => item.id === pending.hostId)

  const submit = async (): Promise<void> => {
    if (!password) return
    setBusy(true)
    try {
      await submitPassword(pending, password, remember)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Password required"
      description={`${host?.username ?? ''}@${host?.hostname ?? 'device'} — this host does not have a saved password.`}
      icon={<LockKeyhole size={20} />}
      size="sm"
      onClose={() => cancelPendingConnect(pending)}
      footer={
        <>
          <div className="modal-footer-left">
            <label className="check-row">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              <span>Remember password</span>
            </label>
          </div>
          <div className="modal-footer-actions">
            <button className="btn" onClick={() => cancelPendingConnect(pending)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={() => void submit()} disabled={!password || busy}>
              {busy ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </>
      }
    >
      <div className="password-modal">
        {error ? <div className="form-error-banner">{error}</div> : null}
        <label className="field">
          <span>Password</span>
          <div className="input-with-action">
            <input
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit()
              }}
              autoFocus
              autoComplete="current-password"
              placeholder="Enter the SSH password"
            />
            <button className="input-action" type="button" onClick={() => setShow((value) => !value)}>
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </label>
        <div className="secure-note">
          <ShieldCheck size={14} />
          {remember
            ? 'The password is encrypted with the operating system credential store.'
            : 'The password stays in memory for this session only.'}
        </div>
        <div className="password-host-meta">
          <KeyRound size={13} />
          {host?.authType === 'key' ? 'Private key authentication' : 'Password authentication'}
          <span>·</span>
          port {host?.port ?? 22}
        </div>
      </div>
    </Modal>
  )
}
