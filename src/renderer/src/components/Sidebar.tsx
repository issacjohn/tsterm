import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  Ellipsis,
  FolderKey,
  Laptop,
  Layers,
  Pencil,
  Plus,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wifi
} from 'lucide-react'
import type { Host } from '@shared/types'
import { useAppStore } from '../store'
import { connectHost, openHostEditor, openLocalTerminal } from '../lib/session-actions'
import { cx, truncate } from '../lib/format'

function initials(label: string): string {
  const parts = label.trim().split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return label.slice(0, 2).toUpperCase()
}

const AVATAR_COLORS = ['#2f7d76', '#7d6a2f', '#5a5f9e', '#8b4f6d', '#3f6f9a', '#7a5c46']

function avatarColor(host: Host): string {
  if (host.color) return host.color
  let value = 0
  for (const character of host.id) value = (value * 31 + character.charCodeAt(0)) % AVATAR_COLORS.length
  return AVATAR_COLORS[value]
}

interface SidebarProps {
  onOpenSettings: () => void
}

export function Sidebar({ onOpenSettings }: SidebarProps): React.JSX.Element {
  const hosts = useAppStore((state) => state.hosts)
  const tabs = useAppStore((state) => state.tabs)
  const catalog = useAppStore((state) => state.catalog)
  const snippets = useAppStore((state) => state.snippets)
  const knownHosts = useAppStore((state) => state.knownHosts)
  const debugSessions = useAppStore((state) => state.debugSessions)
  const setHosts = useAppStore((state) => state.setHosts)
  const notify = useAppStore((state) => state.notify)
  const setModal = useAppStore((state) => state.setModal)
  const [query, setQuery] = useState('')
  const [menuHost, setMenuHost] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuHost) return
    const close = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuHost(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuHost])

  const liveHosts = useMemo(() => {
    const set = new Set<string>()
    for (const tab of tabs) {
      for (const pane of tab.panes) {
        if (pane.hostId && pane.status === 'connected') set.add(pane.hostId)
      }
    }
    return set
  }, [tabs])

  const typeName = (id?: string): string | undefined =>
    id ? catalog.types.find((type) => type.id === id)?.name : undefined

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return hosts
    return hosts.filter((host) =>
      [host.label, host.hostname, host.username, host.group, host.deviceType, ...(host.tags ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(value)
    )
  }, [hosts, query])

  const groups = useMemo(() => {
    const map = new Map<string, Host[]>()
    for (const host of filtered) {
      const key = host.group?.trim() || 'Devices'
      const list = map.get(key) ?? []
      list.push(host)
      map.set(key, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (Boolean(a.favorite) !== Boolean(b.favorite)) return a.favorite ? -1 : 1
        return a.label.localeCompare(b.label)
      })
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const deleteHost = async (host: Host): Promise<void> => {
    setMenuHost(null)
    const confirmed = window.confirm(
      `Delete "${host.label}"?\n\nThe saved connection and its stored credentials will be removed. Open sessions are not affected.`
    )
    if (!confirmed) return
    try {
      const next = await window.tsterm.hosts.delete(host.id)
      setHosts(next)
      notify({ kind: 'success', title: 'Host deleted', message: host.label })
    } catch (error) {
      notify({ kind: 'error', title: 'Could not delete host', message: (error as Error).message })
    }
  }

  const importHosts = async (): Promise<void> => {
    try {
      const result = await window.tsterm.hosts.importHosts()
      setHosts(result.hosts)
      if (result.imported) {
        notify({
          kind: 'success',
          title: `Imported ${result.imported} host${result.imported === 1 ? '' : 's'}`,
          message: result.errors.length ? `${result.errors.length} entries were skipped.` : undefined
        })
      } else if (result.errors.length) {
        notify({ kind: 'error', title: 'Import failed', message: result.errors[0] })
      }
    } catch (error) {
      notify({ kind: 'error', title: 'Import failed', message: (error as Error).message })
    }
  }

  const exportHosts = async (): Promise<void> => {
    try {
      const result = await window.tsterm.hosts.exportHosts()
      if (result) {
        notify({
          kind: 'success',
          title: 'Hosts exported',
          message: `${result.count} host${result.count === 1 ? '' : 's'} saved without passwords.`
        })
      }
    } catch (error) {
      notify({ kind: 'error', title: 'Export failed', message: (error as Error).message })
    }
  }

  const connectedCount = liveHosts.size

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div>
          <span className="eyebrow">Workspace</span>
          <h2>
            Devices <span className="sidebar-count">{hosts.length}</span>
          </h2>
        </div>
        <div className="sidebar-head-actions">
          <button className="icon-btn" onClick={() => void importHosts()} title="Import hosts" aria-label="Import hosts">
            <Download size={15} />
          </button>
          <button className="icon-btn" onClick={() => void exportHosts()} title="Export hosts" aria-label="Export hosts">
            <Upload size={15} />
          </button>
          <button className="icon-btn accent" onClick={() => openHostEditor()} title="Add a device" aria-label="Add a device">
            <Plus size={17} />
          </button>
        </div>
      </div>

      <div className="sidebar-quick">
        <button className="quick-card" onClick={() => openHostEditor()}>
          <span className="quick-icon">
            <Server size={16} />
          </span>
          <span>
            <strong>New connection</strong>
            <small>SSH · any network device</small>
          </span>
          <Plus size={14} className="quick-plus" />
        </button>
      </div>

      <div className="sidebar-search">
        <Search size={14} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search devices"
          aria-label="Search devices"
        />
        {query ? (
          <button className="icon-btn tiny" onClick={() => setQuery('')} aria-label="Clear search">
            ×
          </button>
        ) : null}
      </div>

      <div className="host-scroll">
        {hosts.length === 0 ? (
          <div className="sidebar-empty">
            <div className="empty-orbit">
              <Server size={20} />
            </div>
            <strong>No devices yet</strong>
            <p>Add a firewall, switch, router, or endpoint to start building your troubleshooting workspace.</p>
            <button className="btn btn-primary btn-sm" onClick={() => openHostEditor()}>
              <Plus size={15} /> Add device
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="sidebar-empty compact">
            <Search size={18} />
            <strong>No matches</strong>
            <p>Try a hostname, group, or device type.</p>
          </div>
        ) : (
          groups.map(([group, list]) => (
            <section className="host-group" key={group}>
              <div className="host-group-label">
                <span>{group}</span>
                <span>{list.length}</span>
              </div>
              {list.map((host) => {
                const type = typeName(host.deviceType)
                const live = liveHosts.has(host.id)
                return (
                  <div
                    key={host.id}
                    className={cx('host-row', live && 'is-live', menuHost === host.id && 'menu-open')}
                    role="button"
                    tabIndex={0}
                    onClick={() => connectHost(host.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        connectHost(host.id)
                      }
                    }}
                  >
                    <div
                      className="host-avatar"
                      style={{ '--avatar': avatarColor(host) } as React.CSSProperties}
                    >
                      {initials(host.label)}
                      {live ? <span className="live-dot" /> : null}
                    </div>
                    <div className="host-copy">
                      <div className="host-name">
                        <span>{truncate(host.label, 24)}</span>
                        {host.favorite ? <span className="favorite-mark">★</span> : null}
                      </div>
                      <div className="host-meta">
                        {host.username}@{host.hostname}
                        {host.port !== 22 ? `:${host.port}` : ''}
                      </div>
                      <div className="host-tags">
                        {type ? <span className="mini-pill">{truncate(type, 22)}</span> : <span className="mini-pill muted">Set device type</span>}
                        {host.group ? <span className="mini-tag">{truncate(host.group, 14)}</span> : null}
                      </div>
                    </div>
                    <button
                      className="icon-btn tiny host-menu-trigger"
                      onClick={(event) => {
                        event.stopPropagation()
                        setMenuHost(menuHost === host.id ? null : host.id)
                      }}
                      aria-label={`Host actions for ${host.label}`}
                    >
                      <Ellipsis size={16} />
                    </button>
                    {menuHost === host.id ? (
                      <div className="host-menu" ref={menuRef} onClick={(event) => event.stopPropagation()}>
                        <button onClick={() => connectHost(host.id)}>
                          <Wifi size={14} /> Connect
                        </button>
                        <button
                          onClick={() => {
                            setMenuHost(null)
                            openHostEditor(host.id)
                          }}
                        >
                          <Pencil size={14} /> Edit host
                        </button>
                        <button
                          onClick={() => {
                            setMenuHost(null)
                            setModal({
                              kind: 'device-type',
                              hostId: host.id,
                              current: host.deviceType,
                              title: host.label
                            })
                          }}
                        >
                          <Layers size={14} /> Set device type
                        </button>
                        <button
                          onClick={() => {
                            setMenuHost(null)
                            void window.tsterm.app.copyText(
                              `ssh ${host.username}@${host.hostname}${host.port !== 22 ? ` -p ${host.port}` : ''}`
                            )
                            notify({ kind: 'success', title: 'SSH command copied' })
                          }}
                        >
                          <Download size={14} /> Copy SSH command
                        </button>
                        <div className="menu-sep" />
                        <button className="danger" onClick={() => void deleteHost(host)}>
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </section>
          ))
        )}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-nav">
          <button onClick={() => setModal({ kind: 'snippets' })}>
            <Sparkles size={15} />
            Snippets
            <span>{snippets.length}</span>
          </button>
          <button onClick={() => setModal({ kind: 'known-hosts' })}>
            <FolderKey size={15} />
            Known hosts
            <span>{knownHosts.length}</span>
          </button>
          <button onClick={() => setModal({ kind: 'debug' })}>
            <ShieldCheck size={15} />
            Debug guard
            <span className={debugSessions.length ? 'alert-count' : ''}>{debugSessions.length}</span>
          </button>
          <button onClick={onOpenSettings}>
            <Settings size={15} />
            Settings
          </button>
        </div>
        <button className="sidebar-local" onClick={() => openLocalTerminal()}>
          <Laptop size={15} />
          <span>Local terminal</span>
          <span className="platform-label">
            {useAppStore.getState().appPlatform === 'win32'
              ? 'PowerShell'
              : useAppStore.getState().appPlatform === 'darwin'
                ? 'zsh'
                : 'shell'}
          </span>
        </button>
        <div className="sidebar-footnote">
          {connectedCount ? `${connectedCount} live connection${connectedCount === 1 ? '' : 's'}` : `${hosts.length} saved device${hosts.length === 1 ? '' : 's'}`}
        </div>
      </div>
    </aside>
  )
}
