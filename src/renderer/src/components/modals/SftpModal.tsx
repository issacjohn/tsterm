import { useEffect, useState } from 'react'
import {
  ArrowUp,
  Download,
  File,
  Folder,
  FolderPlus,
  HardDriveDownload,
  Home,
  Pencil,
  RefreshCw,
  Trash2,
  Upload
} from 'lucide-react'
import type { SftpEntry } from '@shared/types'
import { useAppStore } from '../../store'
import { Modal } from '../ui/Modal'
import { formatBytes, truncate } from '../../lib/format'

interface SftpModalProps {
  sessionId: string
  title: string
}

function parentPath(path: string): string {
  if (!path || path === '/') return '/'
  const trimmed = path.replace(/\/+$/, '')
  const index = trimmed.lastIndexOf('/')
  return index <= 0 ? '/' : trimmed.slice(0, index)
}

function breadcrumbParts(path: string): Array<{ label: string; path: string }> {
  const parts = path.split('/').filter(Boolean)
  const result = [{ label: '/', path: '/' }]
  let current = ''
  for (const part of parts) {
    current += `/${part}`
    result.push({ label: part, path: current })
  }
  return result
}

export function SftpModal({ sessionId, title }: SftpModalProps): React.JSX.Element {
  const setModal = useAppStore((state) => state.setModal)
  const notify = useAppStore((state) => state.notify)
  const showHidden = useAppStore((state) => state.settings.sftpShowHidden)
  const [path, setPath] = useState('.')
  const [entries, setEntries] = useState<SftpEntry[]>([])
  const [selected, setSelected] = useState<SftpEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (nextPath: string): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.tsterm.sftp.list(sessionId, nextPath)
      setPath(result.path)
      setEntries(result.entries)
      setSelected(null)
    } catch (loadError) {
      setError((loadError as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load('.')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const upload = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await window.tsterm.sftp.upload(sessionId, path)
      if (result.ok) {
        notify({ kind: 'success', title: 'Upload complete', message: result.message })
        await load(path)
      } else if (result.message && result.message !== 'Upload cancelled.') {
        notify({ kind: 'warning', title: 'Upload cancelled', message: result.message })
      }
    } catch (uploadError) {
      setError((uploadError as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const download = async (entry: SftpEntry): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await window.tsterm.sftp.download(sessionId, entry.path)
      if (result.ok) {
        notify({ kind: 'success', title: 'Download complete', message: result.path })
      }
    } catch (downloadError) {
      setError((downloadError as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const newFolder = async (): Promise<void> => {
    const name = window.prompt('New folder name')
    if (!name) return
    setBusy(true)
    try {
      await window.tsterm.sftp.mkdir(sessionId, `${path.replace(/\/+$/, '')}/${name}`)
      await load(path)
    } catch (folderError) {
      setError((folderError as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const rename = async (entry: SftpEntry): Promise<void> => {
    const name = window.prompt('Rename to', entry.name)
    if (!name || name === entry.name) return
    setBusy(true)
    try {
      const base = entry.path.slice(0, entry.path.lastIndexOf('/'))
      await window.tsterm.sftp.rename(sessionId, entry.path, `${base}/${name}`)
      await load(path)
    } catch (renameError) {
      setError((renameError as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (entry: SftpEntry): Promise<void> => {
    if (!window.confirm(`Delete ${entry.type === 'directory' ? 'folder' : 'file'} "${entry.name}"?`)) return
    setBusy(true)
    try {
      await window.tsterm.sftp.remove(sessionId, entry.path, entry.type === 'directory')
      await load(path)
    } catch (removeError) {
      setError((removeError as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const crumbs = breadcrumbParts(path)
  const visibleEntries = showHidden ? entries : entries.filter((entry) => !entry.name.startsWith('.'))

  return (
    <Modal
      title="SFTP browser"
      description={`${title} · ${path}`}
      icon={<HardDriveDownload size={20} />}
      size="xl"
      onClose={() => setModal(null)}
      footer={
        <>
          <div className="modal-footer-left">
            <span className="sftp-footnote">{visibleEntries.length} items · SFTP runs over the live SSH session</span>
          </div>
          <div className="modal-footer-actions">
            <button className="btn" onClick={() => setModal(null)}>
              Close
            </button>
          </div>
        </>
      }
    >
      <div className="sftp-panel">
        <div className="sftp-toolbar">
          <button className="icon-btn" onClick={() => void load(parentPath(path))} title="Parent folder" disabled={loading}>
            <ArrowUp size={16} />
          </button>
          <button className="icon-btn" onClick={() => void load('.')} title="Home folder" disabled={loading}>
            <Home size={16} />
          </button>
          <button className="icon-btn" onClick={() => void load(path)} title="Refresh" disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : undefined} />
          </button>
          <div className="sftp-breadcrumbs">
            {crumbs.map((crumb, index) => (
              <span key={crumb.path}>
                {index > 0 ? <i>/</i> : null}
                <button onClick={() => void load(crumb.path)} disabled={loading}>
                  {crumb.label}
                </button>
              </span>
            ))}
          </div>
          <div className="sftp-toolbar-actions">
            <button className="btn btn-sm" onClick={() => void newFolder()} disabled={busy}>
              <FolderPlus size={14} /> New folder
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => void upload()} disabled={busy}>
              <Upload size={14} /> Upload
            </button>
          </div>
        </div>

        {error ? <div className="form-error-banner">{error}</div> : null}

        <div className="sftp-table">
          <div className="sftp-table-head">
            <span>Name</span>
            <span>Size</span>
            <span>Modified</span>
            <span />
          </div>
          {loading ? (
            <div className="sftp-loading">
              <RefreshCw size={18} className="spin" /> Reading remote directory…
            </div>
          ) : visibleEntries.length === 0 ? (
            <div className="sftp-empty">
              <Folder size={22} />
              <strong>This folder is empty</strong>
              <p>Upload a file or create a folder.</p>
            </div>
          ) : (
            visibleEntries.map((entry) => (
              <div
                key={entry.path}
                className={`sftp-row${selected?.path === entry.path ? ' selected' : ''}`}
                onClick={() => setSelected(entry)}
                onDoubleClick={() => {
                  if (entry.type === 'directory') void load(entry.path)
                  else void download(entry)
                }}
              >
                <span className="sftp-name">
                  {entry.type === 'directory' ? <Folder size={15} /> : <File size={15} />}
                  {entry.name}
                </span>
                <span>{entry.type === 'directory' ? '—' : formatBytes(entry.size)}</span>
                <span>{entry.modified ? new Date(entry.modified).toLocaleString() : '—'}</span>
                <span className="sftp-row-actions">
                  {entry.type !== 'directory' ? (
                    <button className="icon-btn tiny" title="Download" onClick={(event) => {
                      event.stopPropagation()
                      void download(entry)
                    }}>
                      <Download size={14} />
                    </button>
                  ) : null}
                  <button className="icon-btn tiny" title="Rename" onClick={(event) => {
                    event.stopPropagation()
                    void rename(entry)
                  }}>
                    <Pencil size={14} />
                  </button>
                  <button className="icon-btn tiny danger" title="Delete" onClick={(event) => {
                    event.stopPropagation()
                    void remove(entry)
                  }}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
        <div className="sftp-selection">
          {selected ? (
            <>
              <span>
                Selected: <strong>{truncate(selected.path, 80)}</strong>
              </span>
              {selected.type !== 'directory' ? (
                <button className="btn btn-sm" onClick={() => void download(selected)} disabled={busy}>
                  <Download size={14} /> Download
                </button>
              ) : (
                <button className="btn btn-sm" onClick={() => void load(selected.path)} disabled={busy}>
                  <Folder size={14} /> Open
                </button>
              )}
            </>
          ) : (
            <span className="sftp-hint">Double-click a folder to open it. Double-click a file to download.</span>
          )}
        </div>
      </div>
    </Modal>
  )
}
