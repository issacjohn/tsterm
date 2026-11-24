import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  CornerDownLeft,
  Info,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TerminalSquare
} from 'lucide-react'
import type {
  AsaCommandRecord,
  CommandIndexProgress,
  CommandRisk,
  CommandRouteResult,
  CommandSearchResult,
  CommandStatusResult
} from '@shared/types'
import { renderCommand, riskLabel, validateParameter } from '@shared/command-utils'
import { isLoopbackUrl, isSmallModelName } from '@shared/ai-utils'
import { activePane, useAppStore } from '../store'
import {
  fillTerminalPrompt,
  readTerminalSnapshot,
  saveCommandsAsSnippet
} from '../lib/ai-context'
import { cx, truncate } from '../lib/format'
import { Modal } from './ui/Modal'

type RiskFilter = 'all' | CommandRisk

const COMPLETE_TOP_LEVEL = new Set([
  'reload',
  'erase',
  'delete',
  'format',
  'downgrade',
  'restore',
  'revert',
  'fsck',
  'fips'
])

const RISK_FILTERS: Array<{ id: RiskFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'read_only', label: 'Read only' },
  { id: 'diagnostic', label: 'Diagnostic' },
  { id: 'mutating', label: 'Mutating' },
  { id: 'destructive', label: 'Destructive' }
]

const QUICK_SEARCHES: Record<string, string[]> = {
  'cisco-asa': ['show interface', 'packet-tracer', 'capture', 'show conn'],
  'cisco-ftd': ['show interface', 'packet tracer', 'show running-config', 'capture'],
  'cisco-fmc': ['show', 'inspect', 'trace', 'policy'],
  'cisco-ios': ['show ip interface', 'show ip route', 'debug', 'ping'],
  'cisco-nxos': ['show interface', 'show ip route', 'show tech', 'traceroute'],
  'cisco-9800': ['show client', 'show interface', 'debug client', 'show wlan'],
  'cisco-wlc-aireos': ['show client', 'show interface', 'debug client', 'show wlan'],
  'cisco-meraki': ['show', 'ping', 'traceroute', 'arp'],
  'paloalto-panos': ['show interface', 'show session', 'test routing', 'packet-diag'],
  windows: ['Get-NetTCPConnection', 'Test-NetConnection', 'Resolve-DnsName', 'Get-NetFirewallRule'],
  linux: ['ip addr', 'ss -tulpn', 'journalctl', 'tcpdump'],
  macos: ['ifconfig', 'netstat', 'scutil --dns', 'tcpdump'],
  'generic-network': ['show interface', 'show ip route', 'ping', 'traceroute']
}

function riskClass(risk: CommandRisk): string {
  if (risk === 'read_only') return 'safe'
  if (risk === 'destructive') return 'danger'
  return 'warn'
}

function sourceLabel(source: AsaCommandRecord['source']): string {
  if (source === 'asa-help') return 'ASA help'
  if (source === 'runbook') return 'TSTerm runbook'
  if (source === 'device-help') return 'Device help'
  return 'Cisco docs'
}

function defaultsFor(record: AsaCommandRecord | undefined): Record<string, string> {
  const values: Record<string, string> = {}
  for (const parameter of record?.parameters ?? []) {
    if (parameter.default) values[parameter.name] = parameter.default
  }
  return values
}

function previewCommand(
  record: AsaCommandRecord,
  values: Record<string, string>
): string {
  let command = record.commandTemplate
  for (const parameter of record.parameters) {
    const value = (values[parameter.name] ?? parameter.default ?? '').trim()
    command = command.replaceAll(`{${parameter.name}}`, value || `‹${parameter.name}›`)
  }
  return command.replace(/\s+/g, ' ').trim()
}

export function CommandBrowserModal(): React.JSX.Element | null {
  const modal = useAppStore((state) => state.modal)
  const settings = useAppStore((state) => state.settings)
  const pane = useAppStore(activePane)
  const notify = useAppStore((state) => state.notify)
  const setModal = useAppStore((state) => state.setModal)
  const browser = modal?.kind === 'command-browser' ? modal : null
  const deviceTypeId =
    browser?.deviceTypeId || pane?.deviceTypeId || pane?.session?.deviceType
  const commandDeviceType = deviceTypeId || '__none__'
  const deviceType = useAppStore((state) =>
    state.catalog.types.find((type) => type.id === deviceTypeId)
  )
  const quickSearches = deviceType ? QUICK_SEARCHES[deviceType.id] ?? [] : []

  const [query, setQuery] = useState(browser?.query ?? '')
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all')
  const [result, setResult] = useState<CommandSearchResult | null>(null)
  const [status, setStatus] = useState<CommandStatusResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [ack, setAck] = useState('')
  const [routing, setRouting] = useState(false)
  const [route, setRoute] = useState<CommandRouteResult | null>(null)
  const [progress, setProgress] = useState<CommandIndexProgress | null>(null)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoIndexRef = useRef(false)

  const profile =
    settings.aiProfiles.find((item) => item.id === settings.aiActiveProfileId) ??
    settings.aiProfiles[0]
  const sessionId = pane?.status === 'connected' ? pane.sessionId : undefined

  const refreshStatus = (): void => {
    void window.tsterm.commands.status().then(setStatus)
  }

  useEffect(() => {
    let cancelled = false
    const unsubscribe = window.tsterm.commands.onIndexProgress((next) => {
      setProgress(next)
      if (next.phase === 'done') refreshStatus()
    })
    void window.tsterm.commands
      .status()
      .then((current) => {
        if (cancelled) return
        setStatus(current)
        if (current.vectorReady || current.indexing) return
        if (!settings.aiEnabled || !settings.aiAutoPullLocalModels) return
        if (!profile?.local || !isLoopbackUrl(profile.baseUrl)) return
        const isOllama =
          /11434|ollama/i.test(profile.baseUrl) ||
          /ollama/i.test(profile.id) ||
          /ollama/i.test(profile.name)
        if (!isOllama || autoIndexRef.current) return
        autoIndexRef.current = true
        notify({
          kind: 'info',
          title: 'Preparing hybrid command search',
          message: 'Checking the local embedding model…',
          duration: 5000
        })
        void window.tsterm.commands
          .ensureIndex(profile.id)
          .then((next) => {
            if (cancelled) return
            setStatus(next)
            if (next.vectorReady) {
              notify({
                kind: 'success',
                title: 'Hybrid command search ready',
                message: `${next.vectorCount}/${next.vectorTargetCount} fillable commands embedded.`,
                duration: 6000
              })
            } else if (next.vectorError) {
              notify({
                kind: 'warning',
                title: 'Hybrid command search is not ready',
                message: next.vectorError,
                duration: 9000
              })
            }
          })
          .catch((reason: unknown) => {
            if (cancelled) return
            notify({
              kind: 'warning',
              title: 'Hybrid command search is not ready',
              message: (reason as Error).message,
              duration: 9000
            })
          })
      })
      .catch(() => {
        // Status is best-effort; the browser still works with BM25.
      })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    setRoute(null)
  }, [query])

  useEffect(() => {
    setResult(null)
    setSelectedId(null)
    setValues({})
    setRoute(null)
  }, [commandDeviceType])

  useEffect(() => {
    const term = query.trim()
    if (!term) {
      setResult(null)
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(() => {
      void window.tsterm.commands
        .search({
          query: term,
          limit: 20,
          risk: riskFilter === 'all' ? undefined : riskFilter,
          deviceTypeId: commandDeviceType,
          useVector: true
        })
        .then((next) => {
          if (cancelled) return
          setResult(next)
          setError(null)
        })
        .catch((err: unknown) => {
          if (!cancelled) setError((err as Error).message)
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, riskFilter, status?.vectorReady, commandDeviceType])

  const records = useMemo(() => {
    const list = result?.matches.map((match) => match.record) ?? []
    if (route?.selected && !list.some((record) => record.id === route.selected?.id)) {
      list.unshift(route.selected)
    }
    return list
  }, [result, route])

  const selected = useMemo(
    () => records.find((record) => record.id === selectedId) ?? null,
    [records, selectedId]
  )
  const effectiveValues = useMemo(() => {
    const next = { ...defaultsFor(selected ?? undefined), ...values }
    return next
  }, [selected, values])
  const rendered = useMemo(
    () => (selected ? renderCommand(selected, effectiveValues) : null),
    [selected, effectiveValues]
  )
  const missing = rendered?.missing ?? []
  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {}
    for (const parameter of selected?.parameters ?? []) {
      const value = effectiveValues[parameter.name]
      if (!value) continue
      const error = validateParameter(parameter, value)
      if (error) errors[parameter.name] = error
    }
    return errors
  }, [selected, effectiveValues])
  const destructiveArmed = selected?.risk !== 'destructive' || ack.trim().toUpperCase() === 'CONFIRM'
  const topLevelOnly = Boolean(
    selected?.id.startsWith('asa.cmd.') &&
      !COMPLETE_TOP_LEVEL.has(selected.commandTemplate.trim().toLowerCase())
  )
  const isReference = Boolean(selected?.referenceOnly)
  const canFill = Boolean(
    rendered?.ok &&
      selected &&
      destructiveArmed &&
      sessionId &&
      !topLevelOnly &&
      !isReference
  )
  const canRoute = Boolean(settings.aiEnabled && profile?.model && !routing)

  const selectRecord = (record: AsaCommandRecord, seed?: Record<string, string>): void => {
    setSelectedId(record.id)
    setValues({ ...defaultsFor(record), ...(seed ?? {}) })
    setAck('')
  }

  const runSearchSelection = (record: AsaCommandRecord): void => {
    selectRecord(record)
  }

  const fill = (): void => {
    if (!selected || !rendered?.ok) return
    if (!sessionId) {
      notify({ kind: 'warning', title: 'No live session', message: 'Connect a session first.' })
      return
    }
    if (!destructiveArmed) return
    const outcome = fillTerminalPrompt(sessionId, rendered.command ?? '')
    if (!outcome.ok) {
      notify({ kind: 'warning', title: 'Nothing filled', message: outcome.reason })
      return
    }
    notify({
      kind: 'success',
      title: 'Placed in the prompt',
      message: `${truncate(pane?.title ?? 'session', 28)} — review it, then press Enter yourself.`,
      duration: 6000
    })
  }

  const copy = async (): Promise<void> => {
    const text = isReference ? selected?.syntax : rendered?.command
    if (!text) return
    await window.tsterm.app.copyText(text)
    notify({ kind: 'success', title: 'Copied', message: 'Review the command before running it.' })
  }

  const saveSnippet = async (): Promise<void> => {
    if (!selected || !rendered?.ok || !rendered.command) return
    try {
      await saveCommandsAsSnippet({
        title: `ASA: ${selected.description.split(':')[0].slice(0, 60)}`,
        commands: [rendered.command],
        deviceTypeId: 'cisco-asa'
      })
      notify({ kind: 'success', title: 'Snippet saved', message: 'Find it in Snippets.' })
    } catch (err) {
      notify({ kind: 'error', title: 'Could not save snippet', message: (err as Error).message })
    }
  }

  const askAi = async (): Promise<void> => {
    const term = query.trim()
    if (!term) return
    setRouting(true)
    setError(null)
    try {
      const snapshot = settings.aiIncludeContext ? readTerminalSnapshot(sessionId) : {}
      const next = await window.tsterm.commands.route({
        query: term,
        terminalTail: snapshot.tail,
        profileId: profile?.id,
        deviceTypeId: commandDeviceType
      })
      setRoute(next)
      if (next.ok && next.selected && next.confidence !== 'low') {
        selectRecord(next.selected, next.params)
        if (next.missing.length) {
          notify({
            kind: 'info',
            title: 'AI picked a command',
            message: `Fill the missing value${next.missing.length === 1 ? '' : 's'}: ${next.missing.join(', ')}.`
          })
        }
      } else if (next.ok && next.confidence === 'low') {
        notify({
          kind: 'warning',
          title: 'Low confidence',
          message: 'Pick a candidate manually instead of trusting the model choice.'
        })
      } else if (next.error) {
        notify({ kind: 'warning', title: 'AI could not route that', message: next.error })
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRouting(false)
    }
  }

  const buildIndex = async (): Promise<void> => {
    setBuilding(true)
    setError(null)
    setProgress({ phase: 'checking', done: 0, total: status?.vectorTargetCount ?? 0 })
    try {
      const next = await window.tsterm.commands.ensureIndex(profile?.id)
      setStatus(next)
      if (next.vectorError) {
        notify({ kind: 'error', title: 'Vector index failed', message: next.vectorError })
      } else {
        notify({
          kind: 'success',
          title: 'Hybrid search ready',
          message: `${next.vectorCount} commands indexed with ${next.vectorModel}.`
        })
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBuilding(false)
      setProgress(null)
    }
  }

  if (!browser) return null

  const progressPercent =
    progress?.percent !== undefined
      ? progress.percent
      : progress && progress.total > 0
        ? Math.round((progress.done / progress.total) * 100)
        : 0
  const vectorReady = Boolean(status?.vectorReady)
  const routeLowConfidence = route?.ok && route.confidence === 'low'
  const sortedRecords = [...records].sort((a, b) => {
    const aiPick = route?.selected?.id
    if (a.id === aiPick) return -1
    if (b.id === aiPick) return 1
    return 0
  })

  return (
    <Modal
      title={deviceType ? `${deviceType.name} Command Reference` : 'Command Reference'}
      description="Search the active device pack. Fill only — never Enter."
      icon={<Layers size={20} />}
      size="xl"
      className="command-browser-modal"
      onClose={() => setModal(null)}
      footer={
        <>
          <div className="cmd-footer-status">
            <span className={cx('cmd-index-dot', vectorReady ? 'ready' : 'bm25')} />
            {!deviceType
              ? 'Select a device type'
              : vectorReady
                ? `Hybrid · ${status?.vectorCount ?? 0}/${status?.vectorTargetCount ?? 0} embedded`
                : result
                  ? `BM25 · ${result.total} eligible`
                  : 'BM25 · device-scoped'}
            {deviceType ? <em>{deviceType.name}</em> : null}
            {vectorReady && status?.vectorModel ? <em>{status.vectorModel}</em> : null}
          </div>
          <div className="modal-footer-actions">
            {!vectorReady ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => void buildIndex()}
                disabled={building}
                title="Build the local embedding index with Ollama"
              >
                {building ? <Loader2 size={13} className="spin" /> : <Layers size={13} />}
                {building ? 'Indexing…' : 'Build vector index'}
              </button>
            ) : null}
            <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>
              Close
            </button>
          </div>
        </>
      }
    >
      <div className="cmd-toolbar">
        <div className="cmd-search">
          <Search size={14} />
          <input
            data-autofocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a command, keyword, symptom, or syslog ID…"
            spellCheck={false}
          />
          {searching ? <Loader2 size={13} className="spin" /> : null}
        </div>
        <button
          className="btn btn-primary btn-sm cmd-ai-button"
          onClick={() => void askAi()}
          disabled={!canRoute || !query.trim()}
          title={
            !settings.aiEnabled
              ? 'Enable the AI assistant first'
              : !profile?.model
                ? 'Choose a local Ollama model first'
                : `Route with ${profile.model}. ${
                    settings.aiIncludeContext && sessionId
                      ? 'Live terminal output is included.'
                      : 'Question text only.'
                  }`
          }
        >
          {routing ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
          {routing ? 'Routing…' : 'Let AI choose'}
        </button>
      </div>

      <div className="cmd-filter-row">
        <div className="cmd-risk-filters">
          {RISK_FILTERS.map((item) => (
            <button
              key={item.id}
              className={cx('cmd-filter', riskFilter === item.id && 'active')}
              aria-pressed={riskFilter === item.id}
              onClick={() => setRiskFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="cmd-search-meta">
          {!deviceType
            ? 'Select a device type in the session toolbar to scope commands.'
            : result
              ? `${result.matches.length} shown · ${result.total} eligible${
                  vectorReady ? ` · ${result.vectorReady ? 'hybrid' : 'BM25'}` : ''
                }`
              : `Type to search ${deviceType.name} command records`}
        </div>
      </div>

      {building || progress ? (
        <div className="cmd-index-progress">
          <div className="cmd-index-progress-head">
            <Layers size={12} />
            <span>
              {progress?.phase === 'checking'
                ? 'Checking the local embedding model…'
                : progress?.phase === 'pulling'
                  ? progress.status || 'Downloading the embedding model…'
                  : progress?.phase === 'saving'
                    ? 'Saving the local vector index…'
                    : progress?.phase === 'done'
                      ? 'Vector index ready'
                      : progress?.phase === 'error'
                        ? progress.error || 'Vector index failed'
                        : `Embedding ${progress?.done ?? 0} of ${progress?.total ?? 0} commands`}
            </span>
            <em>{progressPercent}%</em>
          </div>
          <div className="cmd-index-bar">
            <i style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      ) : null}

      {status?.vectorError && !building ? (
        <div className="cmd-inline-warning">
          <AlertTriangle size={13} />
          <span>{status.vectorError} BM25 search still works.</span>
          <button className="btn btn-ghost btn-xs" onClick={() => void buildIndex()}>
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      ) : null}

      {settings.aiEnabled && profile?.model && isSmallModelName(profile.model) ? (
        <div className="cmd-inline-warning">
          <AlertTriangle size={13} />
          <span>
            <strong>{profile.model}</strong> is small for command routing. Qwen3 8B is the tested
            default for this catalog.
          </span>
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => setModal({ kind: 'settings', tab: 'ai' })}
          >
            Switch model
          </button>
        </div>
      ) : null}

      {route ? (
        <div
          className={cx(
            'cmd-route-result',
            route.ok ? (routeLowConfidence ? 'warn' : 'ok') : 'error'
          )}
        >
          <div className="cmd-route-icon">
            {route.ok ? <Sparkles size={15} /> : <AlertTriangle size={15} />}
          </div>
          <div className="cmd-route-copy">
            <strong>
              {route.ok && route.selected
                ? `AI selected: ${riskLabel(route.selected.risk)} · ${sourceLabel(route.selected.source)}`
                : 'AI routing did not produce a command'}
            </strong>
            <p>
              {route.ok
                ? route.reasoning ||
                  (route.missing.length
                    ? `Missing: ${route.missing.join(', ')}`
                    : 'Review the rendered command before filling it.')
                : route.error}
            </p>
            {routeLowConfidence ? (
              <p className="cmd-route-warn">
                Low confidence. Pick a candidate manually instead of trusting this choice.
              </p>
            ) : null}
          </div>
          {route.ok && route.confidence ? (
            <span className={cx('cmd-confidence', route.confidence)}>{route.confidence}</span>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="cmd-inline-warning danger">
          <AlertTriangle size={13} />
          <span>{error}</span>
        </div>
      ) : null}

      {result?.note ? (
        <div className="cmd-inline-warning">
          <Info size={13} />
          <span>{result.note}</span>
        </div>
      ) : null}

      <div className="cmd-layout">
        <div className="cmd-results">
          {!query.trim() ? (
            <div className="cmd-empty">
              <div className="cmd-empty-mark">
                <Search size={17} />
              </div>
              <strong>{deviceType ? `Search the ${deviceType.name} catalog` : 'Search the command catalog'}</strong>
              <p>
                Try a command name, a symptom like “DNS not resolving”, a service like “firewall rule”,
                or an exact token or syslog ID.
              </p>
              {quickSearches.length ? (
                <div className="cmd-quick-searches">
                  <span>Try</span>
                  {quickSearches.map((term) => (
                    <button key={term} onClick={() => setQuery(term)}>
                      {term}
                    </button>
                  ))}
                </div>
              ) : null}
              <span>
                Only this device&apos;s records are searched. Other device packs are ignored.
              </span>
            </div>
          ) : searching && !result ? (
            <div className="cmd-empty">
              <Loader2 size={20} className="spin" />
              <strong>Searching…</strong>
            </div>
          ) : !result?.matches.length ? (
            <div className="cmd-empty">
              <Info size={20} />
              <strong>No match</strong>
              <p>Try fewer words, a command name, or clear the risk filter.</p>
            </div>
          ) : (
            sortedRecords.map((record) => {
              const match = result?.matches.find((item) => item.record.id === record.id)
              const isSelected = record.id === selectedId
              const isAiPick = record.id === route?.selected?.id
              return (
                <button
                  key={record.id}
                  className={cx(
                    'cmd-result',
                    isSelected && 'active',
                    isAiPick && 'ai-pick'
                  )}
                  onClick={() => runSearchSelection(record)}
                >
                  <div className="cmd-result-top">
                    <code>{record.commandTemplate}</code>
                    <span className={cx('cmd-risk', riskClass(record.risk))}>
                      {riskLabel(record.risk)}
                    </span>
                  </div>
                  <p>{record.description}</p>
                  <div className="cmd-result-meta">
                    {record.mode && record.mode !== 'runbook' ? <span>{record.mode}</span> : null}
                    <span>{sourceLabel(record.source)}</span>
                    {isAiPick ? <span className="cmd-ai-tag">AI pick</span> : null}
                    {record.referenceOnly ? (
                      <span>
                        {record.source === 'device-help'
                          ? `device ${record.version}`
                          : 'reference'}
                      </span>
                    ) : null}
                    {match?.via === 'hybrid' ? <span>hybrid</span> : null}
                    <em>{match ? `${Math.round(match.score * 100)}%` : ''}</em>
                  </div>
                  <ChevronRight size={13} className="cmd-result-chevron" />
                </button>
              )
            })
          )}
        </div>

        <div className="cmd-detail">
          {!selected ? (
            <div className="cmd-empty detail">
              <TerminalSquare size={20} />
              <strong>Select a command</strong>
              <p>Parameters, safety notes, examples, and Fill appear here.</p>
            </div>
          ) : (
            <>
              <div className="cmd-detail-head">
                <div>
                  <code>{selected.commandTemplate}</code>
                  <p>{selected.description}</p>
                </div>
                <span className={cx('cmd-risk', riskClass(selected.risk))}>
                  {riskLabel(selected.risk)}
                </span>
              </div>

              <div className="cmd-detail-meta">
                <span>
                  <em>Mode</em>
                  {selected.mode}
                </span>
                <span>
                  <em>Source</em>
                  {sourceLabel(selected.source)}
                </span>
                <span>
                  <em>Version</em>
                  {selected.version}
                </span>
                <span>
                  <em>Category</em>
                  {selected.category}
                </span>
              </div>

              {isReference ? (
                <div className="cmd-note">
                  <Info size={13} />
                  <span>
                    {selected.source === 'device-help'
                      ? `Device help entry from ASA ${selected.version}. The syntax was captured from the device, but this entry is not parameterized for safe Fill. Use Copy.`
                      : "Reference entry from Cisco's ASA command reference. The syntax is documented, but this command is not parameterized for safe Fill. Use Copy or open the Cisco page."}
                  </span>
                </div>
              ) : null}

              <div className={cx('cmd-note', riskClass(selected.risk))}>
                {selected.risk === 'read_only' ? <ShieldCheck size={13} /> : <AlertTriangle size={13} />}
                <span>
                  {selected.risk === 'read_only'
                    ? 'Read-only, but output can be large or contain sensitive configuration. Review before running.'
                    : selected.risk === 'diagnostic'
                      ? selected.cleanup.length
                        ? 'Diagnostic command. Review the cleanup steps below and stop it when you are done.'
                        : 'Diagnostic command with no recorded cleanup. Add a stop/cleanup command before running it.'
                      : selected.risk === 'mutating'
                        ? 'This changes device state. Read the command and know how to revert it.'
                        : 'Destructive command. Type CONFIRM below before this can be filled.'}
                </span>
              </div>

              {selected.cleanup.length ? (
                <div className="cmd-cleanup">
                  <span>Cleanup</span>
                  {selected.cleanup.map((command) => (
                    <code key={command}>{command}</code>
                  ))}
                </div>
              ) : null}

              {topLevelOnly ? (
                <div className="cmd-note warn">
                  <Info size={13} />
                  <span>
                    This is the top-level command entry. Add the subcommand and arguments, or pick a
                    runbook step below for a complete example.
                  </span>
                </div>
              ) : null}

              <div className="cmd-preview">
                <div className="cmd-preview-head">
                  <span>{isReference ? 'Documented syntax' : 'Rendered preview'}</span>
                  <span
                    className={cx(
                      'cmd-preview-state',
                      isReference ? 'reference' : rendered?.ok ? 'ok' : 'missing'
                    )}
                  >
                    {isReference ? (
                      'reference'
                    ) : rendered?.ok ? (
                      <>
                        <Check size={11} /> valid
                      </>
                    ) : (
                      `${missing.length} missing`
                    )}
                  </span>
                </div>
                <code>
                  {isReference
                    ? selected.syntax || selected.commandTemplate
                    : selected
                      ? previewCommand(selected, effectiveValues)
                      : ''}
                </code>
              </div>

              {isReference ? (
                <div className="cmd-no-params">
                  <Info size={12} />{' '}
                  {selected.source === 'device-help'
                    ? 'Parameters are shown in device syntax above. This entry is not parameterized for Fill.'
                    : "Parameters are documented in Cisco's syntax above. This entry is not parameterized for Fill."}
                </div>
              ) : selected.parameters.length ? (
                <div className="cmd-params">
                  <div className="cmd-params-head">
                    <span>Parameters</span>
                    <em>
                      {selected.parameters.filter((parameter) => parameter.required).length} required
                    </em>
                  </div>
                  {selected.parameters.map((parameter) => {
                    const value = effectiveValues[parameter.name] ?? ''
                    return (
                      <label className="cmd-field" key={parameter.name}>
                        <span>
                          {parameter.name}
                          {parameter.required ? <b>*</b> : <em>optional</em>}
                          {parameter.description ? <small>{parameter.description}</small> : null}
                        </span>
                        <input
                          value={value}
                          spellCheck={false}
                          placeholder={
                            parameter.placeholder
                              ? `e.g. ${parameter.placeholder}`
                              : parameter.required
                                ? 'required'
                                : 'optional'
                          }
                          onChange={(event) =>
                            setValues((current) => ({
                              ...current,
                              [parameter.name]: event.target.value
                            }))
                          }
                        />
                        {fieldErrors[parameter.name] ? (
                          <small className="cmd-field-error">{fieldErrors[parameter.name]}</small>
                        ) : null}
                      </label>
                    )
                  })}
                </div>
              ) : (
                <div className="cmd-no-params">
                  <Info size={12} /> No parameters for this record.
                </div>
              )}

              {selected.risk === 'destructive' ? (
                <label className="cmd-confirm">
                  <span>
                    Type <b>CONFIRM</b> to arm the Fill button for a destructive command.
                  </span>
                  <input
                    value={ack}
                    onChange={(event) => setAck(event.target.value)}
                    placeholder="CONFIRM"
                    spellCheck={false}
                  />
                </label>
              ) : null}

              {selected.examples.length ? (
                <div className="cmd-examples">
                  <span>Examples</span>
                  {selected.examples.map((example) => (
                    <code key={example}>{example}</code>
                  ))}
                </div>
              ) : null}

              <div className="cmd-actions">
                <button className="btn btn-primary btn-sm" onClick={fill} disabled={!canFill}>
                  <CornerDownLeft size={13} /> Fill
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => void copy()}
                  disabled={!isReference && !rendered?.ok}
                >
                  <Copy size={13} /> Copy
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => void saveSnippet()}
                  disabled={!rendered?.ok || topLevelOnly || isReference}
                >
                  <Sparkles size={13} /> Snippet
                </button>
                {isReference && selected.url ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => void window.tsterm.app.openExternal(selected.url ?? '')}
                  >
                    <ArrowUpRight size={13} /> Cisco doc
                  </button>
                ) : null}
                <span className="cmd-actions-hint">
                  {isReference
                    ? selected.source === 'device-help'
                      ? 'Reference only - Copy the device syntax. Fill is disabled.'
                      : 'Reference only - Copy the syntax or open the Cisco doc. Fill is disabled.'
                    : topLevelOnly
                      ? 'This top-level record is incomplete. Add the subcommand or choose a runbook step.'
                      : !sessionId
                        ? 'Fill writes one line and never presses Enter. Connect a session first.'
                        : !rendered?.ok
                          ? `Enter ${missing.join(', ')} first.`
                          : 'Writes one line. Never presses Enter.'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
