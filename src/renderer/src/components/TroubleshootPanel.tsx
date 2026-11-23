import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Bot,
  ChevronRight,
  CircleHelp,
  Copy,
  Filter,
  Play,
  Search,
  ShieldAlert,
  Sparkles,
  Wrench
} from 'lucide-react'
import type { DeviceType, Workflow } from '@shared/types'
import {
  buildRunbook,
  initialValues,
  runbookCleanupCommands,
  runbookCommands,
  searchWorkflows,
  validateValues
} from '@shared/catalog-utils'
import { activePane, useAppStore } from '../store'
import { openDeviceTypePickerForPane, trackCopiedWorkflow } from '../lib/session-actions'
import { cx, truncate } from '../lib/format'
import { AiChatPanel } from './AiChatPanel'

function severityClass(workflow: Workflow): string {
  return workflow.severity === 'danger' ? 'danger' : workflow.severity === 'caution' ? 'caution' : 'info'
}

function effectClass(workflow: Workflow): string {
  return `effect-${workflow.effect}`
}

function effectLabel(workflow: Workflow): string {
  if (workflow.effect === 'debug') return 'Debug'
  if (workflow.effect === 'capture') return 'Capture'
  if (workflow.effect === 'change') return 'Changes state'
  return 'Read only'
}

interface DetailProps {
  type: DeviceType
  workflow: Workflow
  onBack: () => void
}

function WorkflowDetail({ type, workflow, onBack }: DetailProps): React.JSX.Element {
  const pane = useAppStore(activePane)
  const hosts = useAppStore((state) => state.hosts)
  const notify = useAppStore((state) => state.notify)
  const setModal = useAppStore((state) => state.setModal)
  const aiEnabled = useAppStore((state) => state.settings.aiEnabled)
  const setAiThread = useAppStore((state) => state.setAiThread)
  const setTroubleshootTab = useAppStore((state) => state.setTroubleshootTab)
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(workflow))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const host = hosts.find((item) => item.id === pane?.hostId)
  const category = type.categories.find((item) => item.id === workflow.category)
  const runbook = buildRunbook(workflow, values)
  const commands = runbookCommands(runbook)
  const cleanup = runbookCleanupCommands(runbook)

  useEffect(() => {
    setValues(initialValues(workflow))
    setErrors({})
  }, [workflow])

  const validate = (): boolean => {
    const next = validateValues(workflow, values)
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const openRunbook = (): void => {
    if (!validate()) return
    setModal({
      kind: 'runbook',
      typeId: type.id,
      workflowId: workflow.id,
      values,
      hostId: pane?.hostId,
      hostLabel: host?.label ?? pane?.title ?? 'Current device',
      hostname: host?.hostname,
      sessionId: pane?.sessionId
    })
  }

  const askAssistant = (): void => {
    if (!aiEnabled) {
      setModal({ kind: 'settings', tab: 'ai' })
      return
    }
    if (pane) {
      setAiThread(pane.id, {
        draft: `Review the "${workflow.title}" runbook for ${host?.label ?? pane.title ?? 'this device'}. What should I verify before and after, what would prove the cause, and is any cleanup missing?`
      })
    }
    setTroubleshootTab('assistant')
  }

  const copyCommands = async (): Promise<void> => {
    if (!validate()) return
    if (!commands.length) {
      notify({ kind: 'warning', title: 'Nothing to copy', message: 'This workflow has no executable commands.' })
      return
    }
    await window.tsterm.app.copyText(commands.join('\n'))
    await trackCopiedWorkflow({
      hostLabel: host?.label ?? pane?.title ?? 'Current device',
      hostname: host?.hostname,
      hostId: pane?.hostId,
      deviceType: type,
      workflow,
      values,
      sessionId: pane?.sessionId,
      mode: 'copy'
    })
    notify({
      kind: 'success',
      title: 'Commands copied',
      message:
        workflow.effect === 'debug' || workflow.effect === 'capture'
          ? `${workflow.title} is tracked. Use the debug guard to stop it.`
          : `${commands.length} command${commands.length === 1 ? '' : 's'} on the clipboard.`
    })
  }

  return (
    <div className="ts-detail">
      <button className="ts-back" onClick={onBack}>
        <ArrowLeft size={14} /> All runbooks
      </button>
      <div className="ts-detail-head">
        <div className="ts-detail-badges">
          <span className={cx('severity-badge', severityClass(workflow))}>
            {workflow.severity === 'danger' ? 'Danger' : workflow.severity === 'caution' ? 'Caution' : 'Safe'}
          </span>
          <span className={cx('effect-badge', effectClass(workflow))}>{effectLabel(workflow)}</span>
          <span className="category-badge">{category?.name ?? workflow.category}</span>
        </div>
        <h3>{workflow.title}</h3>
        <p>{workflow.summary}</p>
      </div>

      {workflow.requires.length ? (
        <div className="ts-require">
          <ShieldAlert size={14} />
          <span>{workflow.requires.join(' · ')}</span>
        </div>
      ) : null}

      {workflow.variables.length ? (
        <div className="ts-vars">
          <div className="ts-section-label">
            Inputs
            <span>{workflow.variables.length}</span>
          </div>
          {workflow.variables.map((variable) => (
            <label className={cx('ts-field', errors[variable.name] && 'has-error')} key={variable.name}>
              <span className="ts-field-label">
                {variable.prompt}
                {variable.required ? <em>required</em> : <em className="optional">optional</em>}
                <span className="ts-field-type">{variable.type}</span>
              </span>
              {variable.type === 'choice' ? (
                <select
                  value={values[variable.name] ?? ''}
                  onChange={(event) => {
                    setValues((current) => ({ ...current, [variable.name]: event.target.value }))
                    setErrors((current) => {
                      const next = { ...current }
                      delete next[variable.name]
                      return next
                    })
                  }}
                >
                  {variable.choices.map((choice) => (
                    <option value={choice.value} key={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={values[variable.name] ?? ''}
                  placeholder={variable.placeholder ?? variable.default ?? ''}
                  onChange={(event) => {
                    setValues((current) => ({ ...current, [variable.name]: event.target.value }))
                    setErrors((current) => {
                      const next = { ...current }
                      delete next[variable.name]
                      return next
                    })
                  }}
                />
              )}
              {variable.help ? <span className="field-help">{variable.help}</span> : null}
              {errors[variable.name] ? <span className="field-error">{errors[variable.name]}</span> : null}
            </label>
          ))}
        </div>
      ) : (
        <div className="ts-no-inputs">No inputs needed — the runbook is ready.</div>
      )}

      <div className="ts-preview">
        <div className="ts-section-label">
          Commands
          <span>{commands.length}</span>
        </div>
        <pre className="command-preview">
          {commands.length ? (
            commands.slice(0, 5).map((command, index) => (
              <span key={`${command}-${index}`} className="command-line">
                <i>{String(index + 1).padStart(2, '0')}</i>
                {command}
              </span>
            ))
          ) : (
            <span className="muted-line">Manual steps only</span>
          )}
          {commands.length > 5 ? <span className="muted-line">+ {commands.length - 5} more commands</span> : null}
        </pre>
      </div>

      {cleanup.length ? (
        <div className="ts-cleanup">
          <div className="ts-section-label">
            Cleanup included
            <span>{cleanup.length}</span>
          </div>
          <code>{truncate(cleanup.join(' · '), 160)}</code>
        </div>
      ) : null}

      {workflow.notes.length ? (
        <div className="ts-notes">
          <BookOpen size={13} />
          <div>
            {workflow.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="ts-detail-actions">
        <button className="btn btn-primary" onClick={openRunbook}>
          <Play size={14} />
          Open runbook
        </button>
        <button className="btn" onClick={() => void copyCommands()}>
          <Copy size={14} />
          Copy
        </button>
        <button className="btn" onClick={askAssistant} title={aiEnabled ? 'Review with the AI assistant' : 'Set up the AI assistant'}>
          <Bot size={14} />
          Ask AI
        </button>
      </div>
      <div className="ts-target-line">
        {pane?.status === 'connected' ? (
          <>
            <span className="status-dot connected" />
            Sending to {truncate(host?.label ?? pane.title, 26)}
          </>
        ) : (
          <>
            <CircleHelp size={12} />
            Open a session to send directly. Copy still works.
          </>
        )}
      </div>
    </div>
  )
}

export function TroubleshootPanel(): React.JSX.Element {
  const pane = useAppStore(activePane)
  const catalog = useAppStore((state) => state.catalog)
  const setModal = useAppStore((state) => state.setModal)
  const tab = useAppStore((state) => state.troubleshootTab)
  const setTab = useAppStore((state) => state.setTroubleshootTab)
  const aiEnabled = useAppStore((state) => state.settings.aiEnabled)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const type = catalog.types.find((item) => item.id === pane?.deviceTypeId)
  const selected = type?.workflows.find((workflow) => workflow.id === selectedId) ?? null

  useEffect(() => {
    setSelectedId(null)
    setQuery('')
    setCategory('all')
  }, [type?.id])

  const hits = useMemo(() => {
    if (!type) return []
    return searchWorkflows(type, query).filter((hit) => category === 'all' || hit.workflow.category === category)
  }, [type, query, category])

  if (!pane) {
    return (
      <aside className="troubleshoot-panel">
        <div className="ts-empty">
          <div className="ts-empty-icon">
            <Wrench size={22} />
          </div>
          <h3>Troubleshooting library</h3>
          <p>Open an SSH or local session and TSTerm will load the right runbooks for that platform.</p>
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'palette' })}>
            Open command palette
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="troubleshoot-panel">
      <div className="ts-head">
        <div className="ts-title-line">
          <div>
            <span className="eyebrow">
              {tab === 'assistant' ? <Bot size={11} /> : <Sparkles size={11} />}
              {tab === 'assistant' ? 'Assistant' : 'Runbooks'}
            </span>
            <h2>Troubleshoot</h2>
          </div>
          {type ? (
            <button
              className="ts-device-pill"
              onClick={() => {
                const tabId = useAppStore.getState().activeTabId
                if (tabId) openDeviceTypePickerForPane(tabId, pane.id, pane.deviceTypeId)
              }}
              title="Change device type"
            >
              <span>{truncate(type.name, 22)}</span>
              <ChevronRight size={13} />
            </button>
          ) : null}
        </div>

        <div className="ts-mode-tabs" role="tablist" aria-label="Troubleshooting mode">
          <button
            role="tab"
            aria-selected={tab === 'runbooks'}
            className={tab === 'runbooks' ? 'active' : ''}
            onClick={() => setTab('runbooks')}
          >
            <BookOpen size={13} /> Runbooks
          </button>
          <button
            role="tab"
            aria-selected={tab === 'assistant'}
            className={tab === 'assistant' ? 'active' : ''}
            onClick={() => setTab('assistant')}
          >
            <Bot size={13} /> Assistant
            {!aiEnabled ? <span className="ts-tab-badge">off</span> : null}
          </button>
        </div>

        {tab === 'runbooks' && type ? (
          <>
            <div className="ts-search">
              <Search size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="radius debugs, packet capture, bgp…"
                aria-label="Search troubleshooting runbooks"
                data-autofocus
              />
              {query ? (
                <button className="icon-btn tiny" onClick={() => setQuery('')} aria-label="Clear search">
                  ×
                </button>
              ) : null}
            </div>
            <div className="ts-filter-row">
              <Filter size={12} />
              <select
                className="ts-category-select"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                aria-label="Filter by category"
              >
                <option value="all">All categories</option>
                {type.categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <span className="ts-count">{hits.length}</span>
            </div>
          </>
        ) : null}
      </div>

      {tab === 'assistant' ? (
        <AiChatPanel />
      ) : (
        <div className="ts-body">
          {!type ? (
            <div className="ts-empty">
              <div className="ts-empty-icon">
                <Sparkles size={22} />
              </div>
              <h3>Pick the device type</h3>
              <p>
                TSTerm remembers the platform per host. Choose one now and the correct runbooks appear on
                every future connection.
              </p>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const tabId = useAppStore.getState().activeTabId
                  if (tabId) openDeviceTypePickerForPane(tabId, pane.id, pane.deviceTypeId)
                }}
              >
                Choose device type
              </button>
            </div>
          ) : selected ? (
            <WorkflowDetail type={type} workflow={selected} onBack={() => setSelectedId(null)} />
          ) : hits.length === 0 ? (
            <div className="ts-empty compact">
              <Search size={20} />
              <h3>No runbooks match</h3>
              <p>
                Try a protocol, command, or symptom. You can also add a command snippet or create a custom
                device pack.
              </p>
              <button className="btn btn-sm" onClick={() => setModal({ kind: 'snippets' })}>
                Open snippets
              </button>
            </div>
          ) : (
            <div className="ts-list">
              {hits.map(({ workflow, category: cat }) => (
                <button
                  key={workflow.id}
                  className="ts-row"
                  onClick={() => setSelectedId(workflow.id)}
                >
                  <span className={cx('ts-severity', severityClass(workflow))} title={workflow.severity} />
                  <span className="ts-row-copy">
                    <span className="ts-row-title">{workflow.title}</span>
                    <span className="ts-row-meta">
                      {cat.name}
                      <i>·</i>
                      <span className={cx('tiny-effect', effectClass(workflow))}>{effectLabel(workflow)}</span>
                    </span>
                  </span>
                  <ChevronRight size={14} className="ts-row-arrow" />
                </button>
              ))}
              <div className="ts-list-foot">
                Not finding it? <button onClick={() => setModal({ kind: 'new-device-type' })}>Add a command pack</button>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
