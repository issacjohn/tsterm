import { useEffect, useRef, useState } from 'react'
import { Braces, FolderOpen, Plus, Upload } from 'lucide-react'
import { useAppStore } from '../../store'
import { Modal } from '../ui/Modal'
import { cx } from '../../lib/format'

const FAMILIES = ['Firewall', 'Router', 'Switch', 'Wireless', 'Endpoint', 'Cloud', 'Other']

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function NewDeviceTypeModal(): React.JSX.Element {
  const catalog = useAppStore((state) => state.catalog)
  const setCatalog = useAppStore((state) => state.setCatalog)
  const setModal = useAppStore((state) => state.setModal)
  const notify = useAppStore((state) => state.notify)
  const [name, setName] = useState('My device')
  const [id, setId] = useState('custom-device')
  const [vendor, setVendor] = useState('Custom')
  const [family, setFamily] = useState('Other')
  const [extendsId, setExtendsId] = useState('')
  const [json, setJson] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const templateRef = useRef<Record<string, unknown> | null>(null)

  useEffect(() => {
    void window.tsterm.catalog
      .template()
      .then((text) => {
        try {
          templateRef.current = JSON.parse(text) as Record<string, unknown>
        } catch {
          templateRef.current = null
        }
        setJson(text)
        setLoaded(true)
      })
      .catch((error) => {
        setErrors([(error as Error).message])
        setLoaded(true)
      })
  }, [])

  const generate = (): void => {
    const base = templateRef.current
    if (!base) return
    const finalId = slugify(id || name) || 'custom-device'
    const next: Record<string, unknown> = {
      ...base,
      id: finalId,
      name: name.trim() || finalId,
      vendor: vendor.trim() || 'Custom',
      family,
      aliases: [finalId],
      description: `Troubleshooting pack for ${name.trim() || finalId}. Edit the starter workflows for your platform.`
    }
    if (extendsId) {
      next.extends = extendsId
      next.categories = []
      next.workflows = []
      next.notes = [
        `Inherits the ${extendsId} runbook set. Add workflows here to extend or override them.`
      ]
    } else {
      delete next.extends
    }
    setId(finalId)
    setJson(JSON.stringify(next, null, 2))
    setErrors([])
  }

  const save = async (): Promise<void> => {
    setBusy(true)
    setErrors([])
    try {
      let parsed: { id?: string } = {}
      try {
        parsed = JSON.parse(json) as { id?: string }
      } catch {
        setErrors(['The editor contains invalid JSON.'])
        return
      }
      const existing = catalog.types.find((type) => type.id === parsed.id)
      if (existing?.source === 'custom' && !window.confirm(`Overwrite the custom device pack "${existing.name}"?`)) {
        return
      }
      const result = await window.tsterm.catalog.saveCustom(json)
      if (!result.ok || !result.bundle) {
        setErrors(result.errors?.length ? result.errors : ['The pack could not be saved.'])
        return
      }
      setCatalog(result.bundle)
      setModal(null)
      notify({
        kind: 'success',
        title: 'Device pack created',
        message: 'It appears in the device picker and the troubleshooting panel immediately.',
        duration: 5000
      })
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
        notify({ kind: 'success', title: 'Device pack imported' })
        setModal(null)
      } else if (result && !result.ok) {
        setErrors(result.errors ?? ['Import failed.'])
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Create a device type"
      description="A device pack is JSON. Start with the template, then edit the commands for the platform."
      icon={<Braces size={20} />}
      size="xl"
      onClose={() => setModal(null)}
      footer={
        <>
          <div className="modal-footer-left">
            <button className="btn btn-ghost btn-sm" onClick={() => void importPack()} disabled={busy}>
              <Upload size={14} /> Import JSON
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => void window.tsterm.catalog.openFolder()}>
              <FolderOpen size={14} /> Open packs folder
            </button>
          </div>
          <div className="modal-footer-actions">
            <button className="btn" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={() => void save()} disabled={busy || !loaded}>
              {busy ? 'Saving…' : 'Create device type'}
            </button>
          </div>
        </>
      }
    >
      <div className="pack-editor">
        <div className="pack-form">
          <div className="form-grid three">
            <label className="field">
              <span>Name</span>
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  if (!id || id === 'custom-device') setId(slugify(event.target.value))
                }}
                placeholder="Palo Alto Prisma"
              />
            </label>
            <label className="field">
              <span>ID</span>
              <input
                value={id}
                onChange={(event) => setId(slugify(event.target.value))}
                placeholder="custom-device"
                spellCheck={false}
              />
            </label>
            <label className="field">
              <span>Vendor</span>
              <input value={vendor} onChange={(event) => setVendor(event.target.value)} placeholder="Custom" />
            </label>
          </div>
          <div className="form-grid three">
            <label className="field">
              <span>Family</span>
              <select value={family} onChange={(event) => setFamily(event.target.value)}>
                {FAMILIES.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Extends</span>
              <select value={extendsId} onChange={(event) => setExtendsId(event.target.value)}>
                <option value="">Blank template</option>
                {catalog.types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn pack-generate" onClick={generate} disabled={!loaded}>
              <Plus size={14} /> Generate starter
            </button>
          </div>
          <p className="field-help pack-help">
            Extending an existing type inherits all of its categories and workflows. Add workflows with the same ID
            to override one, or use <code>removeWorkflows</code> to drop inherited entries.
          </p>
        </div>

        {errors.length ? (
          <div className="pack-errors">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}

        <div className="pack-editor-head">
          <span>Device pack JSON</span>
          <span>{json.split('\n').length} lines</span>
        </div>
        <textarea
          className={cx('json-editor')}
          value={json}
          onChange={(event) => {
            setJson(event.target.value)
            setErrors([])
          }}
          spellCheck={false}
          aria-label="Device pack JSON"
        />
        <div className="pack-cheat">
          <span>
            <code>effect</code>: read · debug · capture · change
          </span>
          <span>
            <code>cleanup</code>: required for debug/capture
          </span>
          <span>
            <code>{'{variable}'}</code>: substituted from inputs
          </span>
        </div>
      </div>
    </Modal>
  )
}
