import { useMemo, useState } from 'react'
import { Copy, Plus, Search, Send, Sparkles, Trash2 } from 'lucide-react'
import type { Snippet, SnippetInput } from '@shared/types'
import { useAppStore, activePane } from '../../store'
import { writeCommandsSequential } from '../../lib/session-actions'
import { Modal } from '../ui/Modal'
import { cx, truncate } from '../../lib/format'

function emptyDraft(): SnippetInput {
  return { title: '', command: '', description: '', tags: [], deviceTypeId: '' }
}

export function SnippetsModal(): React.JSX.Element {
  const snippets = useAppStore((state) => state.snippets)
  const catalog = useAppStore((state) => state.catalog)
  const setSnippets = useAppStore((state) => state.setSnippets)
  const setModal = useAppStore((state) => state.setModal)
  const notify = useAppStore((state) => state.notify)
  const pane = useAppStore(activePane)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | undefined>(snippets[0]?.id)
  const [draft, setDraft] = useState<SnippetInput>(() => {
    const first = snippets[0]
    return first
      ? {
          id: first.id,
          title: first.title,
          command: first.command,
          description: first.description,
          tags: first.tags,
          deviceTypeId: first.deviceTypeId
        }
      : emptyDraft()
  })
  const [tagsText, setTagsText] = useState((snippets[0]?.tags ?? []).join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return snippets
    return snippets.filter((snippet) =>
      [snippet.title, snippet.command, snippet.description, ...(snippet.tags ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(value)
    )
  }, [snippets, query])

  const select = (snippet: Snippet): void => {
    setSelectedId(snippet.id)
    setDraft({
      id: snippet.id,
      title: snippet.title,
      command: snippet.command,
      description: snippet.description,
      tags: snippet.tags,
      deviceTypeId: snippet.deviceTypeId
    })
    setTagsText((snippet.tags ?? []).join(', '))
    setError(null)
  }

  const newSnippet = (): void => {
    setSelectedId(undefined)
    setDraft(emptyDraft())
    setTagsText('')
    setError(null)
  }

  const save = async (): Promise<void> => {
    if (!draft.title.trim() || !draft.command.trim()) {
      setError('A title and command are required.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const next = await window.tsterm.snippets.save({
        ...draft,
        tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
        deviceTypeId: draft.deviceTypeId || undefined
      })
      setSnippets(next)
      const saved = next.find(
        (snippet) =>
          (draft.id && snippet.id === draft.id) ||
          (!draft.id && snippet.title === draft.title && snippet.command === draft.command)
      )
      if (saved) {
        setSelectedId(saved.id)
        setDraft((current) => ({ ...current, id: saved.id }))
      }
      notify({ kind: 'success', title: 'Snippet saved', message: 'It now feeds inline suggestions too.' })
    } catch (saveError) {
      setError((saveError as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!draft.id) return
    if (!window.confirm(`Delete snippet "${draft.title}"?`)) return
    setBusy(true)
    try {
      const next = await window.tsterm.snippets.delete(draft.id)
      setSnippets(next)
      newSnippet()
      notify({ kind: 'success', title: 'Snippet deleted' })
    } finally {
      setBusy(false)
    }
  }

  const copy = async (): Promise<void> => {
    await window.tsterm.app.copyText(draft.command)
    notify({ kind: 'success', title: 'Snippet copied' })
  }

  const send = async (): Promise<void> => {
    if (!pane?.sessionId || pane.status !== 'connected') {
      await copy()
      return
    }
    await writeCommandsSequential(pane.sessionId, draft.command.split(/\r?\n/).filter(Boolean))
    notify({ kind: 'success', title: 'Snippet sent', message: `To ${truncate(pane.title, 26)}` })
  }

  return (
    <Modal
      title="Snippets"
      description="Reusable commands that are one click away — and part of the inline suggestion engine."
      icon={<Sparkles size={20} />}
      size="xl"
      onClose={() => setModal(null)}
      footer={
        <>
          <div className="modal-footer-left">
            <button className="btn btn-ghost btn-sm" onClick={newSnippet}>
              <Plus size={14} /> New snippet
            </button>
            {draft.id ? (
              <button className="btn btn-danger-ghost btn-sm" onClick={() => void remove()}>
                <Trash2 size={14} /> Delete
              </button>
            ) : null}
          </div>
          <div className="modal-footer-actions">
            {pane?.status === 'connected' ? (
              <button className="btn" onClick={() => void send()} disabled={!draft.command.trim()}>
                <Send size={14} /> Send to terminal
              </button>
            ) : (
              <button className="btn" onClick={() => void copy()} disabled={!draft.command.trim()}>
                <Copy size={14} /> Copy
              </button>
            )}
            <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save snippet'}
            </button>
          </div>
        </>
      }
    >
      <div className="snippets-layout">
        <div className="snippet-list">
          <div className="device-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search snippets"
              aria-label="Search snippets"
            />
            {query ? (
              <button className="icon-btn tiny" onClick={() => setQuery('')} aria-label="Clear search">
                ×
              </button>
            ) : null}
          </div>
          <div className="snippet-scroll">
            {filtered.length === 0 ? (
              <div className="snippet-empty">
                <Sparkles size={20} />
                <strong>No snippets yet</strong>
                <p>Save your go-to commands, filters, or a whole onboarding sequence.</p>
                <button className="btn btn-primary btn-sm" onClick={newSnippet}>
                  <Plus size={14} /> Create the first
                </button>
              </div>
            ) : (
              filtered.map((snippet) => (
                <button
                  key={snippet.id}
                  className={cx('snippet-row', selectedId === snippet.id && 'active')}
                  onClick={() => select(snippet)}
                >
                  <span className="snippet-row-title">{truncate(snippet.title, 28)}</span>
                  <code>{truncate(snippet.command.split('\n')[0], 42)}</code>
                  <span className="snippet-row-meta">
                    {(snippet.tags ?? []).slice(0, 2).map((tag) => (
                      <em key={tag}>{tag}</em>
                    ))}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
        <div className="snippet-editor">
          {error ? <div className="form-error-banner">{error}</div> : null}
          <div className="form-grid two">
            <label className="field">
              <span>
                Title <em>required</em>
              </span>
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="RADIUS debugs — single user"
              />
            </label>
            <label className="field">
              <span>Device scope</span>
              <select
                value={draft.deviceTypeId ?? ''}
                onChange={(event) => setDraft((current) => ({ ...current, deviceTypeId: event.target.value }))}
              >
                <option value="">Any device</option>
                {catalog.types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>
              Command <em>required</em>
            </span>
            <textarea
              className="code-input"
              rows={8}
              value={draft.command}
              onChange={(event) => setDraft((current) => ({ ...current, command: event.target.value }))}
              placeholder="debug radius user jsmith&#10;show logging | include RADIUS&#10;no debug radius all"
              spellCheck={false}
            />
          </label>
          <div className="form-grid two">
            <label className="field">
              <span>Tags</span>
              <input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="radius, aaa" />
            </label>
            <label className="field">
              <span>Description</span>
              <input
                value={draft.description ?? ''}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="When to use this"
              />
            </label>
          </div>
          <div className="snippet-hint">
            <Sparkles size={13} />
            Snippets scoped to this device type are added to inline suggestions automatically.
          </div>
        </div>
      </div>
    </Modal>
  )
}
