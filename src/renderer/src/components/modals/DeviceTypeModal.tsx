import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Cloud,
  Download,
  Laptop,
  Network,
  Plus,
  Router,
  Search,
  Server,
  Shield,
  Wifi,
  Workflow
} from 'lucide-react'
import type { DeviceType } from '@shared/types'
import { filterDeviceTypes } from '@shared/catalog-utils'
import { useAppStore, type ModalState } from '../../store'
import { setDeviceTypeForHost } from '../../lib/session-actions'
import { Modal } from '../ui/Modal'
import { cx, truncate } from '../../lib/format'

type DeviceModal = Extract<ModalState, { kind: 'device-type' }>

function familyIcon(family: string): typeof Shield {
  const value = family.toLowerCase()
  if (value.includes('firewall') || value.includes('security')) return Shield
  if (value.includes('router')) return Router
  if (value.includes('switch') || value.includes('network')) return Network
  if (value.includes('wireless')) return Wifi
  if (value.includes('endpoint') || value.includes('desktop')) return Laptop
  if (value.includes('cloud') || value.includes('wireless lan')) return Cloud
  return Box
}

export function DeviceTypeModal({ modal }: { modal: DeviceModal }): React.JSX.Element {
  const catalog = useAppStore((state) => state.catalog)
  const hosts = useAppStore((state) => state.hosts)
  const setCatalog = useAppStore((state) => state.setCatalog)
  const setModal = useAppStore((state) => state.setModal)
  const notify = useAppStore((state) => state.notify)
  const updatePane = useAppStore((state) => state.updatePane)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | undefined>(modal.current)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const popularity = useMemo(() => {
    const counts = new Map<string, number>()
    for (const host of hosts) {
      if (host.deviceType) counts.set(host.deviceType, (counts.get(host.deviceType) ?? 0) + 1)
    }
    return counts
  }, [hosts])

  const filtered = useMemo(() => {
    const list = filterDeviceTypes(catalog.types, query)
    if (query.trim()) return list
    return [...list].sort((a, b) => {
      const byPopularity = (popularity.get(b.id) ?? 0) - (popularity.get(a.id) ?? 0)
      if (byPopularity) return byPopularity
      return a.name.localeCompare(b.name)
    })
  }, [catalog.types, query, popularity])

  const selected: DeviceType | undefined =
    filtered.find((type) => type.id === selectedId) ??
    catalog.types.find((type) => type.id === selectedId) ??
    filtered[0]

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const choose = async (): Promise<void> => {
    if (!selected) return
    setBusy(true)
    try {
      if (modal.hostId) {
        await setDeviceTypeForHost(modal.hostId, selected.id, modal.tabId, modal.paneId)
      } else {
        if (modal.tabId && modal.paneId) {
          updatePane(modal.tabId, modal.paneId, { deviceTypeId: selected.id })
        }
        notify({
          kind: 'success',
          title: 'Device type set',
          message: `${selected.name} runbooks are ready.`,
          duration: 2500
        })
        setModal(null)
      }
    } finally {
      setBusy(false)
    }
  }

  const importPack = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.tsterm.catalog.importCustom()
      if (result?.ok && result.bundle) {
        setCatalog(result.bundle)
        notify({ kind: 'success', title: 'Device pack imported', message: 'It is available immediately.' })
        const fresh = result.bundle.types.find((type) => !catalog.types.some((old) => old.id === type.id))
        if (fresh) setSelectedId(fresh.id)
      } else if (result && !result.ok) {
        notify({
          kind: 'error',
          title: 'Pack could not be imported',
          message: result.errors?.[0] ?? 'Check the JSON and try again.',
          duration: 8000
        })
      }
    } catch (error) {
      notify({ kind: 'error', title: 'Import failed', message: (error as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={modal.current ? 'Change device type' : 'What kind of device is this?'}
      description={
        modal.title
          ? `${modal.title} — choose the CLI family that matches this device. TSTerm will remember it.`
          : 'Choose the CLI family that matches this device. TSTerm will remember it for next time.'
      }
      icon={<Server size={20} />}
      size="lg"
      onClose={() => setModal(null)}
      footer={
        <>
          <div className="modal-footer-left">
            <button className="btn btn-ghost btn-sm" onClick={() => void importPack()} disabled={busy}>
              <Download size={14} /> Import pack
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setModal({ kind: 'new-device-type' })}
              disabled={busy}
            >
              <Plus size={14} /> New device type
            </button>
          </div>
          <div className="modal-footer-actions">
            <button className="btn" onClick={() => setModal(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={() => void choose()} disabled={!selected || busy}>
              Use {selected ? truncate(selected.name, 26) : 'device type'}
            </button>
          </div>
        </>
      }
    >
      <div className="device-picker-layout">
        <div className="device-picker-list">
          <div className="device-search">
            <Search size={14} />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search ASA, Nexus, Palo Alto, Windows…"
              aria-label="Search device types"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && selected) {
                  event.preventDefault()
                  void choose()
                }
              }}
            />
            {query ? (
              <button className="icon-btn tiny" onClick={() => setQuery('')} aria-label="Clear search">
                ×
              </button>
            ) : null}
          </div>
          <div className="device-list-scroll">
            {filtered.length === 0 ? (
              <div className="device-list-empty">
                <Search size={18} />
                <strong>No match</strong>
                <p>Create a custom device pack or import one.</p>
              </div>
            ) : (
              filtered.map((type) => {
                const Icon = familyIcon(type.family)
                return (
                  <button
                    key={type.id}
                    className={cx('device-option', selected?.id === type.id && 'selected')}
                    onClick={() => setSelectedId(type.id)}
                    onDoubleClick={() => void choose()}
                  >
                    <span className="device-option-icon">
                      <Icon size={16} />
                    </span>
                    <span className="device-option-copy">
                      <span className="device-option-name">
                        {type.name}
                        {type.source === 'custom' ? <em>custom</em> : null}
                      </span>
                      <span className="device-option-meta">
                        {type.vendor} · {type.family}
                      </span>
                    </span>
                    <span className="device-option-count">{type.workflows.length}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
        <aside className="device-preview">
          {selected ? (
            <>
              <div className="device-preview-icon">{familyIcon(selected.family) && (() => {
                const Icon = familyIcon(selected.family)
                return <Icon size={22} />
              })()}</div>
              <div className="device-preview-vendor">{selected.vendor}</div>
              <h3>{selected.name}</h3>
              <p>{selected.description || `${selected.family} device pack.`}</p>
              <div className="device-preview-stats">
                <div>
                  <strong>{selected.workflows.length}</strong>
                  <span>runbooks</span>
                </div>
                <div>
                  <strong>{selected.categories.length}</strong>
                  <span>categories</span>
                </div>
                <div>
                  <strong>{selected.source === 'custom' ? 'Yes' : 'No'}</strong>
                  <span>custom</span>
                </div>
              </div>
              {selected.aliases.length ? (
                <div className="device-preview-tags">
                  {selected.aliases.slice(0, 5).map((alias) => (
                    <span key={alias}>{alias}</span>
                  ))}
                </div>
              ) : null}
              {selected.notes.length ? (
                <div className="device-preview-notes">
                  {selected.notes.slice(0, 3).map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
              ) : null}
              <div className="device-preview-foot">
                <Workflow size={13} />
                Runbooks load as soon as you choose.
              </div>
            </>
          ) : (
            <div className="device-preview-empty">Select a device type to see its runbook coverage.</div>
          )}
        </aside>
      </div>
    </Modal>
  )
}
