import { useMemo, useState } from 'react'
import {
  FolderOpen,
  KeyRound,
  Laptop,
  Network,
  Plus,
  Server,
  Shield,
  Star,
  Trash2,
  UserRound,
  Wifi
} from 'lucide-react'
import type { AuthType, Host, HostInput } from '@shared/types'
import { useAppStore } from '../../store'
import { cacheHostCredentials, connectHost } from '../../lib/session-actions'
import { Modal } from '../ui/Modal'
import { cx } from '../../lib/format'

interface HostModalProps {
  hostId?: string
  onClose: () => void
}

function fromHost(host: Host | undefined): HostInput {
  return {
    id: host?.id,
    label: host?.label ?? '',
    hostname: host?.hostname ?? '',
    port: host?.port ?? 22,
    username: host?.username ?? '',
    authType: host?.authType ?? 'password',
    privateKeyPath: host?.privateKeyPath ?? '',
    group: host?.group ?? '',
    tags: host?.tags ?? [],
    deviceType: host?.deviceType ?? '',
    color: host?.color,
    jumpHostId: host?.jumpHostId,
    startupCommand: host?.startupCommand ?? '',
    keepaliveSeconds: host?.keepaliveSeconds,
    notes: host?.notes ?? '',
    favorite: host?.favorite ?? false,
    savePassword: Boolean(host?.hasStoredPassword) || !host,
    password: '',
    passphrase: ''
  }
}

const AUTH_OPTIONS: Array<{ value: AuthType; label: string; icon: typeof KeyRound; help: string }> = [
  { value: 'password', label: 'Password', icon: Shield, help: 'Stored with the OS keychain when you choose to remember it.' },
  { value: 'key', label: 'Private key', icon: KeyRound, help: 'Use an OpenSSH private key, with an optional passphrase.' },
  { value: 'agent', label: 'SSH agent', icon: Wifi, help: 'Uses SSH_AUTH_SOCK on macOS/Linux, or Pageant on Windows.' }
]

export function HostModal({ hostId, onClose }: HostModalProps): React.JSX.Element {
  const hosts = useAppStore((state) => state.hosts)
  const catalog = useAppStore((state) => state.catalog)
  const setHosts = useAppStore((state) => state.setHosts)
  const updatePanesForHost = useAppStore((state) => state.updatePanesForHost)
  const notify = useAppStore((state) => state.notify)
  const existing = hosts.find((host) => host.id === hostId)
  const [form, setForm] = useState<HostInput>(() => fromHost(existing))
  const [tagsText, setTagsText] = useState((existing?.tags ?? []).join(', '))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const groupedTypes = useMemo(() => {
    const groups = new Map<string, typeof catalog.types>()
    for (const type of catalog.types) {
      const list = groups.get(type.vendor) ?? []
      list.push(type)
      groups.set(type.vendor, list)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [catalog.types])

  const jumpHosts = hosts.filter((host) => host.id !== existing?.id)

  const patch = (value: Partial<HostInput>): void => {
    setForm((current) => ({ ...current, ...value }))
    setError(null)
  }

  const validate = (): string | null => {
    if (!form.hostname.trim()) return 'Hostname or IP address is required.'
    if (!form.username.trim()) return 'Username is required.'
    if (!Number.isInteger(Number(form.port)) || Number(form.port) < 1 || Number(form.port) > 65535) {
      return 'Port must be between 1 and 65535.'
    }
    if (form.authType === 'key' && !form.privateKeyPath?.trim()) return 'Choose a private key file.'
    const jumpHost = hosts.find((host) => host.id === form.jumpHostId)
    if (jumpHost && jumpHost.authType === 'password' && !jumpHost.hasStoredPassword) {
      return 'Save a password on the jump host before using it.'
    }
    return null
  }

  const save = async (connect: boolean): Promise<void> => {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    try {
      const input: HostInput = {
        ...form,
        label: form.label.trim() || form.hostname.trim(),
        hostname: form.hostname.trim(),
        username: form.username.trim(),
        port: Number(form.port),
        tags: tagsText
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        privateKeyPath: form.privateKeyPath?.trim() || undefined,
        group: form.group?.trim() || undefined,
        deviceType: form.deviceType || undefined,
        startupCommand: form.startupCommand?.trim() || undefined,
        notes: form.notes?.trim() || undefined
      }
      const result = await window.tsterm.hosts.save(input)
      setHosts(result.hosts)
      if (input.deviceType) updatePanesForHost(result.host.id, { deviceTypeId: input.deviceType })
      if (result.warning) {
        notify({ kind: 'warning', title: 'Credentials not stored', message: result.warning, duration: 8000 })
      }
      if (form.password || form.passphrase) {
        cacheHostCredentials(result.host.id, { password: form.password, passphrase: form.passphrase })
      }
      onClose()
      if (connect) {
        notify({
          kind: 'success',
          title: existing ? 'Host updated' : 'Host saved',
          message: `${result.host.label} is ready.`,
          duration: 2200
        })
        connectHost(result.host.id)
      } else {
        notify({
          kind: 'success',
          title: existing ? 'Host updated' : 'Host saved',
          message: result.host.label,
          duration: 2200
        })
      }
    } catch (saveError) {
      setError((saveError as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const browseKey = async (): Promise<void> => {
    const selected = await window.tsterm.app.chooseFile({
      title: 'Choose a private key',
      properties: ['openFile']
    })
    if (selected) patch({ privateKeyPath: selected })
  }

  const remove = async (): Promise<void> => {
    if (!existing) return
    const confirmed = window.confirm(`Delete "${existing.label}"?\n\nThe saved connection and credentials will be removed.`)
    if (!confirmed) return
    setBusy(true)
    try {
      const next = await window.tsterm.hosts.delete(existing.id)
      setHosts(next)
      onClose()
      notify({ kind: 'success', title: 'Host deleted', message: existing.label })
    } catch (deleteError) {
      setError((deleteError as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const auth = AUTH_OPTIONS.find((option) => option.value === form.authType) ?? AUTH_OPTIONS[0]

  return (
    <Modal
      title={existing ? 'Edit device' : 'New SSH connection'}
      description={
        existing
          ? 'Update the connection, credentials, and the platform used for troubleshooting.'
          : 'TSTerm remembers the device type per host, so you only choose it once.'
      }
      icon={existing ? <Server size={20} /> : <Plus size={20} />}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <div className="modal-footer-left">
            {existing ? (
              <button className="btn btn-danger-ghost" onClick={() => void remove()} disabled={busy}>
                <Trash2 size={14} /> Delete
              </button>
            ) : (
              <span className="privacy-note">
                <Shield size={13} /> Passwords use OS encryption
              </span>
            )}
          </div>
          <div className="modal-footer-actions">
            <button className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn" onClick={() => void save(false)} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button className="btn btn-primary" onClick={() => void save(true)} disabled={busy}>
              <Wifi size={14} /> Save & connect
            </button>
          </div>
        </>
      }
    >
      <div className="host-form">
        {error ? <div className="form-error-banner">{error}</div> : null}

        <section className="form-section">
          <div className="form-section-title">
            <Network size={14} /> Connection
          </div>
          <div className="form-grid two">
            <label className="field">
              <span>Display name</span>
              <input
                value={form.label}
                onChange={(event) => patch({ label: event.target.value })}
                placeholder="ASA-HQ"
                data-autofocus
              />
            </label>
            <label className="field">
              <span>Group</span>
              <input
                value={form.group}
                onChange={(event) => patch({ group: event.target.value })}
                placeholder="Firewalls"
              />
            </label>
          </div>
          <div className="form-grid host-port-grid">
            <label className="field">
              <span>
                Hostname or IP <em>required</em>
              </span>
              <input
                value={form.hostname}
                onChange={(event) => patch({ hostname: event.target.value })}
                placeholder="192.168.0.101"
                spellCheck={false}
              />
            </label>
            <label className="field">
              <span>Port</span>
              <input
                type="number"
                value={form.port}
                onChange={(event) => patch({ port: Number(event.target.value) })}
                min={1}
                max={65535}
              />
            </label>
            <label className="field">
              <span>
                Username <em>required</em>
              </span>
              <input
                value={form.username}
                onChange={(event) => patch({ username: event.target.value })}
                placeholder="admin"
                spellCheck={false}
              />
            </label>
          </div>
          <div className="field">
            <span>Device type</span>
            <select
              value={form.deviceType ?? ''}
              onChange={(event) => patch({ deviceType: event.target.value })}
            >
              <option value="">Ask me on the first connection</option>
              {groupedTypes.map(([vendor, types]) => (
                <optgroup label={vendor} key={vendor}>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name} · {type.family}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span className="field-help">
              Pick the closest CLI family. It controls the troubleshooting runbooks and can be changed anytime.
            </span>
          </div>
        </section>

        <section className="form-section">
          <div className="form-section-title">
            <UserRound size={14} /> Authentication
          </div>
          <div className="auth-segment">
            {AUTH_OPTIONS.map((option) => {
              const Icon = option.icon
              return (
                <button
                  key={option.value}
                  className={cx('auth-option', form.authType === option.value && 'active')}
                  onClick={() => patch({ authType: option.value })}
                  type="button"
                >
                  <Icon size={15} />
                  {option.label}
                </button>
              )
            })}
          </div>
          <p className="auth-help">{auth.help}</p>

          {form.authType === 'password' ? (
            <div className="form-grid two">
              <label className="field">
                <span>Password</span>
                <div className="input-with-action">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password ?? ''}
                    onChange={(event) => patch({ password: event.target.value })}
                    placeholder={existing?.hasStoredPassword ? '•••••••• (saved)' : 'Enter password'}
                    autoComplete="new-password"
                  />
                  <button className="input-action" type="button" onClick={() => setShowPassword((value) => !value)}>
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
              <label className="check-row auth-remember">
                <input
                  type="checkbox"
                  checked={Boolean(form.savePassword)}
                  onChange={(event) => patch({ savePassword: event.target.checked })}
                />
                <span>
                  Remember password
                  <small>Uses Windows DPAPI, macOS Keychain, or libsecret.</small>
                </span>
              </label>
            </div>
          ) : null}

          {form.authType === 'key' ? (
            <div className="form-grid two">
              <label className="field">
                <span>Private key file</span>
                <div className="input-with-action">
                  <input
                    value={form.privateKeyPath ?? ''}
                    onChange={(event) => patch({ privateKeyPath: event.target.value })}
                    placeholder="C:\Users\me\.ssh\id_ed25519"
                    spellCheck={false}
                  />
                  <button className="input-action" type="button" onClick={() => void browseKey()}>
                    <FolderOpen size={14} /> Browse
                  </button>
                </div>
              </label>
              <label className="field">
                <span>Key passphrase</span>
                <input
                  type="password"
                  value={form.passphrase ?? ''}
                  onChange={(event) => patch({ passphrase: event.target.value })}
                  placeholder="Optional"
                  autoComplete="new-password"
                />
              </label>
            </div>
          ) : null}

          {form.authType === 'agent' ? (
            <div className="agent-note">
              <Wifi size={14} />
              Make sure your agent is running and has the key loaded. On Windows, Pageant must be running.
            </div>
          ) : null}

          {jumpHosts.length ? (
            <label className="field">
              <span>Connect through a jump host</span>
              <select
                value={form.jumpHostId ?? ''}
                onChange={(event) => patch({ jumpHostId: event.target.value || undefined })}
              >
                <option value="">Direct connection</option>
                {jumpHosts.map((host) => (
                  <option key={host.id} value={host.id}>
                    {host.label} ({host.username}@{host.hostname})
                  </option>
                ))}
              </select>
              <span className="field-help">
                Jump host connections reuse the saved credentials of the selected device.
              </span>
            </label>
          ) : null}
        </section>

        <section className="form-section">
          <div className="form-section-title">
            <Star size={14} /> Organisation
          </div>
          <div className="form-grid two">
            <label className="field">
              <span>Tags</span>
              <input
                value={tagsText}
                onChange={(event) => setTagsText(event.target.value)}
                placeholder="production, dmz, cisco"
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={Boolean(form.favorite)}
                onChange={(event) => patch({ favorite: event.target.checked })}
              />
              <span>
                Pin to the top
                <small>Favourites are shown first in the device list.</small>
              </span>
            </label>
          </div>
          <details className="advanced-details">
            <summary>Advanced session options</summary>
            <div className="form-grid two">
              <label className="field">
                <span>Startup command</span>
                <input
                  value={form.startupCommand ?? ''}
                  onChange={(event) => patch({ startupCommand: event.target.value })}
                  placeholder="terminal length 0"
                />
                <span className="field-help">Runs once after the shell opens.</span>
              </label>
              <label className="field">
                <span>Keepalive (seconds)</span>
                <input
                  type="number"
                  min={0}
                  max={300}
                  value={form.keepaliveSeconds ?? 30}
                  onChange={(event) => patch({ keepaliveSeconds: Number(event.target.value) })}
                />
              </label>
            </div>
            <label className="field">
              <span>Notes</span>
              <textarea
                rows={2}
                value={form.notes ?? ''}
                onChange={(event) => patch({ notes: event.target.value })}
                placeholder="Change window, owner, maintenance notes…"
              />
            </label>
          </details>
        </section>

        {existing ? (
          <div className="host-history-note">
            <Laptop size={13} />
            Last connected: {existing.lastConnectedAt ? new Date(existing.lastConnectedAt).toLocaleString() : 'never'}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
