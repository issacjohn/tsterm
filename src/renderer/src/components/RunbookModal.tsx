import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ClipboardCopy,
  Info,
  Send,
  ShieldCheck,
  TerminalSquare
} from 'lucide-react'
import {
  buildRunbook,
  buildRunbookText,
  effectWarning,
  runbookCleanupCommands,
  runbookCommands
} from '@shared/catalog-utils'
import { useAppStore } from '../store'
import { sendWorkflow, trackCopiedWorkflow } from '../lib/session-actions'
import { Modal } from './ui/Modal'
import { cx, truncate } from '../lib/format'

export function RunbookModal(): React.JSX.Element | null {
  const modal = useAppStore((state) => state.modal)
  const catalog = useAppStore((state) => state.catalog)
  const tabs = useAppStore((state) => state.tabs)
  const notify = useAppStore((state) => state.notify)
  const setModal = useAppStore((state) => state.setModal)
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<'commands' | 'runbook' | null>(null)

  const runbookModal = modal?.kind === 'runbook' ? modal : null
  const type = runbookModal ? catalog.types.find((item) => item.id === runbookModal.typeId) : undefined
  const workflow = type?.workflows.find((item) => item.id === runbookModal?.workflowId)

  const targetPane = useMemo(() => {
    if (!runbookModal?.sessionId) return undefined
    for (const tab of tabs) {
      const pane = tab.panes.find((item) => item.sessionId === runbookModal.sessionId)
      if (pane) return pane
    }
    return undefined
  }, [tabs, runbookModal?.sessionId])

  if (!runbookModal || !type || !workflow) return null

  const runbook = buildRunbook(workflow, runbookModal.values)
  const commands = runbookCommands(runbook)
  const cleanup = runbookCleanupCommands(runbook)
  const canSend = Boolean(targetPane && targetPane.status === 'connected' && commands.length)
  const needsAck = workflow.effect !== 'read'
  const close = (): void => setModal(null)

  const copyCommands = async (): Promise<void> => {
    await window.tsterm.app.copyText(commands.join('\n'))
    await trackCopiedWorkflow({
      hostLabel: runbookModal.hostLabel,
      hostname: runbookModal.hostname,
      hostId: runbookModal.hostId,
      deviceType: type,
      workflow,
      values: runbookModal.values,
      sessionId: runbookModal.sessionId,
      mode: 'copy'
    })
    setCopied('commands')
    window.setTimeout(() => setCopied(null), 3000)
    notify({
      kind: 'success',
      title: 'Commands copied',
      message: workflow.effect === 'debug' || workflow.effect === 'capture'
        ? 'The debug is tracked. Stop it from the debug guard when you are done.'
        : `${commands.length} command${commands.length === 1 ? '' : 's'} on the clipboard.`
    })
  }

  const copyRunbook = async (): Promise<void> => {
    const text = buildRunbookText(workflow, runbookModal.values, runbook, {
      deviceLabel: runbookModal.hostLabel,
      deviceHost: runbookModal.hostname,
      deviceTypeName: type.name
    })
    await window.tsterm.app.copyText(text)
    await trackCopiedWorkflow({
      hostLabel: runbookModal.hostLabel,
      hostname: runbookModal.hostname,
      hostId: runbookModal.hostId,
      deviceType: type,
      workflow,
      values: runbookModal.values,
      sessionId: runbookModal.sessionId,
      mode: 'copy'
    })
    setCopied('runbook')
    window.setTimeout(() => setCopied(null), 3000)
    notify({
      kind: 'success',
      title: 'Runbook copied',
      message: 'Includes commands, notes, and cleanup instructions.'
    })
  }

  const send = async (): Promise<void> => {
    if (needsAck && !ack) return
    if (!canSend || !runbookModal.sessionId) return
    setBusy(true)
    try {
      const ok = await sendWorkflow({
        hostLabel: runbookModal.hostLabel,
        hostname: runbookModal.hostname,
        hostId: runbookModal.hostId,
        deviceType: type,
        workflow,
        values: runbookModal.values,
        sessionId: runbookModal.sessionId,
        mode: 'send'
      })
      if (ok) close()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={workflow.title}
      description={`${type.name} · ${runbookModal.hostLabel}${runbookModal.hostname ? ` (${runbookModal.hostname})` : ''}`}
      icon={workflow.effect === 'read' ? <ShieldCheck size={20} /> : <AlertTriangle size={20} />}
      size="lg"
      onClose={close}
      footer={
        <>
          <div className="runbook-footer-left">
            {needsAck ? (
              <label className="check-row">
                <input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} />
                <span>I understand these commands change device state</span>
              </label>
            ) : (
              <span className="runbook-safe">
                <ShieldCheck size={14} /> Read-only runbook
              </span>
            )}
            {copied ? (
              <span className="runbook-copied">
                <Check size={13} /> Copied to clipboard
              </span>
            ) : null}
          </div>
          <div className="runbook-footer-actions">
            <button className="btn btn-ghost" onClick={() => void copyRunbook()}>
              {copied === 'runbook' ? <Check size={14} /> : <ClipboardCopy size={14} />}
              {copied === 'runbook' ? 'Runbook copied' : 'Copy runbook'}
            </button>
            <button className="btn" onClick={() => void copyCommands()} disabled={!commands.length}>
              {copied === 'commands' ? <Check size={14} /> : <ClipboardCopy size={14} />}
              {copied === 'commands' ? 'Copied' : 'Copy commands'}
            </button>
            {canSend ? (
              <button
                className="btn btn-primary"
                onClick={() => void send()}
                disabled={busy || (needsAck && !ack)}
              >
                <Send size={14} /> {busy ? 'Sending…' : 'Send to terminal'}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => void copyCommands()} disabled={!commands.length}>
                <ClipboardCopy size={14} /> Copy commands
              </button>
            )}
          </div>
        </>
      }
    >
      <div className={cx('runbook-warning', workflow.effect === 'read' ? 'safe' : workflow.severity)}>
        <div className="runbook-warning-icon">
          {workflow.effect === 'read' ? <Info size={16} /> : <AlertTriangle size={16} />}
        </div>
        <div>
          <strong>
            {workflow.effect === 'read'
              ? 'Safe to run'
              : workflow.effect === 'debug'
                ? 'This enables debugging'
                : workflow.effect === 'capture'
                  ? 'This starts a packet capture'
                  : 'This changes the device state'}
          </strong>
          <p>{effectWarning(workflow)}</p>
        </div>
      </div>

      <div className="runbook-meta">
        <div>
          <span>Target</span>
          <strong>
            <span className={`status-dot ${targetPane?.status === 'connected' ? 'connected' : 'idle'}`} />
            {targetPane ? truncate(targetPane.title, 28) : 'No active session'}
          </strong>
        </div>
        <div>
          <span>Inputs</span>
          <strong>
            {Object.entries(runbookModal.values).filter(([, value]) => value).length
              ? Object.entries(runbookModal.values)
                  .filter(([, value]) => value)
                  .map(([name, value]) => `${name}=${truncate(value, 14)}`)
                  .join(' · ')
              : 'none'}
          </strong>
        </div>
        <div>
          <span>Commands</span>
          <strong>{commands.length}</strong>
        </div>
        <div>
          <span>Cleanup</span>
          <strong className={cleanup.length ? 'cleanup-count' : ''}>{cleanup.length || 'none'}</strong>
        </div>
      </div>

      <div className="runbook-section">
        <div className="runbook-section-head">
          <h3>Commands</h3>
          <span>{commands.length}</span>
        </div>
        <div className="runbook-commands">
          {runbook.primary.length ? (
            runbook.primary.map((step) => (
              <div className="runbook-step" key={`${step.index}-${step.command ?? step.instruction}`}>
                <span className="runbook-index">{String(step.index).padStart(2, '0')}</span>
                <div className="runbook-step-copy">
                  {step.instruction ? <p className="runbook-instruction">{step.instruction}</p> : null}
                  {step.command ? <code>{step.command}</code> : null}
                  {step.note ? <p className="runbook-note">{step.note}</p> : null}
                </div>
              </div>
            ))
          ) : (
            <p className="runbook-muted">No automatic commands — follow the instructions above.</p>
          )}
          {runbook.verify.length ? (
            <>
              <div className="runbook-inline-label">Verify</div>
              {runbook.verify.map((step) => (
                <div className="runbook-step" key={`${step.index}-${step.command ?? step.instruction}`}>
                  <span className="runbook-index">{String(step.index).padStart(2, '0')}</span>
                  <div className="runbook-step-copy">
                    {step.instruction ? <p className="runbook-instruction">{step.instruction}</p> : null}
                    {step.command ? <code>{step.command}</code> : null}
                    {step.note ? <p className="runbook-note">{step.note}</p> : null}
                  </div>
                </div>
              ))}
            </>
          ) : null}
        </div>
      </div>

      {cleanup.length ? (
        <div className="runbook-section cleanup-section">
          <div className="runbook-section-head">
            <h3>Cleanup</h3>
            <span>{cleanup.length}</span>
          </div>
          <p className="cleanup-copy">
            Run these when you are finished. TSTerm will also offer them when you close the app.
          </p>
          <div className="runbook-commands">
            {runbook.cleanup.map((step) => (
              <div className="runbook-step" key={`${step.index}-${step.command ?? step.instruction}`}>
                <span className="runbook-index">{String(step.index).padStart(2, '0')}</span>
                <div className="runbook-step-copy">
                  {step.command ? <code>{step.command}</code> : null}
                  {step.note ? <p className="runbook-note">{step.note}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {workflow.notes.length ? (
        <div className="runbook-notes">
          <Info size={14} />
          <div>
            {workflow.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </div>
      ) : null}

      {workflow.references.length ? (
        <div className="runbook-refs">
          {workflow.references.map((reference) => (
            <button
              key={reference.url}
              className="text-link"
              onClick={() => void window.tsterm.app.openExternal(reference.url)}
            >
              {reference.title} <ArrowUpRight size={12} />
            </button>
          ))}
        </div>
      ) : null}

      {!canSend ? (
        <div className="runbook-no-target">
          <TerminalSquare size={14} />
          This runbook can be copied, but there is no active terminal to send it to. Open or reconnect the
          session first.
        </div>
      ) : null}

      {canSend && needsAck && ack ? (
        <div className="runbook-ready">
          <Check size={13} /> Ready to send one command at a time to {truncate(targetPane?.title ?? '', 24)}
        </div>
      ) : null}
    </Modal>
  )
}
