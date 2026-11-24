import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  BookOpen,
  Bot,
  Check,
  CircleStop,
  Copy,
  CornerDownLeft,
  Download,
  Eraser,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  X
} from 'lucide-react'
import type {
  AiChatMessage,
  AiProfile,
  CommandVerification
} from '@shared/types'
import { isCommandRequest, isLoopbackUrl, isSmallModelName } from '@shared/ai-utils'
import { activePane, EMPTY_AI_THREAD, useAppStore } from '../store'
import { saveSettings } from '../lib/session-actions'
import { cancelAiMessage, clearAiThread, sendAiMessage } from '../lib/ai-chat'
import {
  cancelLocalModelPull,
  ensureLocalModel,
  formatModelBytes,
  installLocalRuntime,
  localPullStatusLabel,
  useLocalModelState
} from '../lib/ai-local'
import {
  analyzeAiCommands,
  extractInlineCommands,
  fillTerminalPrompt,
  looksLikeCommand,
  parseAiContent,
  redactUnverifiedCommands,
  saveCommandsAsSnippet,
  type AiBlock
} from '../lib/ai-context'
import { cx, truncate } from '../lib/format'

function profileLabel(profile: AiProfile | undefined): string {
  if (!profile) return 'No provider'
  return `${profile.name}${profile.local && !/local/i.test(profile.name) ? ' · local' : ''}`
}

function MessageAvatar({ role }: { role: 'user' | 'assistant' }): React.JSX.Element {
  return (
    <span className={cx('ai-avatar', role)}>
      {role === 'assistant' ? <Bot size={14} /> : <TerminalSquare size={13} />}
    </span>
  )
}

function useFillCommand(): (command: string) => void {
  const pane = useAppStore(activePane)
  const notify = useAppStore((state) => state.notify)
  return (command: string): void => {
    const sessionId = pane?.status === 'connected' ? pane.sessionId : undefined
    if (!sessionId) {
      notify({
        kind: 'warning',
        title: 'No live session',
        message: 'Connect a session before filling a command.'
      })
      return
    }
    const result = fillTerminalPrompt(sessionId, command)
    if (!result.ok) {
      notify({ kind: 'warning', title: 'Nothing filled', message: result.reason })
      return
    }
    notify({
      kind: 'success',
      title: 'Placed in the prompt',
      message: `${truncate(pane?.title ?? 'Active session', 30)} — nothing was executed. Press Enter yourself.`,
      duration: 6000
    })
  }
}

function GroundingStatus({
  verification,
  pending
}: {
  verification?: CommandVerification
  pending: boolean
}): React.JSX.Element | null {
  if (pending) {
    return (
      <span className="ai-grounding pending">
        <Loader2 size={10} className="spin" /> Checking the local catalog…
      </span>
    )
  }
  if (!verification) {
    return (
      <span className="ai-grounding unknown">
        <AlertTriangle size={10} /> Not checked. Verify it on the device.
      </span>
    )
  }
  if (verification.status === 'verified') {
    // The block summary already states that all commands are verified. Keeping
    // a second label on every line is unnecessary visual noise.
    return null
  }
  if (verification.status === 'documented') {
    return (
      <span className="ai-grounding documented">
        <BookOpen size={10} />{' '}
        {verification.source === 'device-help'
          ? `Device help ${verification.version ?? ''} — reference only, Fill disabled`
          : 'Documented reference, not verified — Fill disabled'}
      </span>
    )
  }
  return (
    <span className="ai-grounding unknown">
      <AlertTriangle size={10} /> Not in the local device catalog — verify on the device
    </span>
  )
}

function CommandBlock({
  block,
  stateChanging,
  verifications,
  pending
}: {
  block: AiBlock
  stateChanging: boolean
  verifications: Record<string, CommandVerification>
  pending: boolean
}): React.JSX.Element {
  const pane = useAppStore(activePane)
  const notify = useAppStore((state) => state.notify)
  const sessionId = pane?.status === 'connected' ? pane.sessionId : undefined
  const fill = useFillCommand()

  const copyAll = async (): Promise<void> => {
    const text = block.commands.length ? block.commands.join('\n') : block.code.trim()
    if (!text) return
    await window.tsterm.app.copyText(text)
    notify({ kind: 'success', title: 'Copied', message: 'Review the commands before running them.' })
  }


  const saveSnippet = async (): Promise<void> => {
    try {
      await saveCommandsAsSnippet({
        title: 'AI assistant commands',
        commands: block.commands.length ? block.commands : [block.code],
        deviceTypeId: pane?.deviceTypeId
      })
      notify({ kind: 'success', title: 'Snippet saved', message: 'Find it in Snippets.' })
    } catch (error) {
      notify({ kind: 'error', title: 'Could not save snippet', message: (error as Error).message })
    }
  }

  return (
    <div className="ai-code">
      <div className="ai-code-head">
        <span className="ai-code-head-label">
          Suggested command{block.commands.length === 1 ? '' : 's'}
          {stateChanging ? <em className="ai-risk-badge">state-changing</em> : null}
        </span>
        <div className="ai-code-actions">
          <button
            className="icon-btn tiny"
            onClick={() => void copyAll()}
            aria-label="Copy all suggested commands"
            title="Copy commands"
          >
            <Copy size={13} />
          </button>
          <button
            className="icon-btn tiny"
            onClick={() => void saveSnippet()}
            aria-label="Save suggested commands as a snippet"
            title="Save as snippet"
          >
            <Sparkles size={13} />
          </button>
        </div>
      </div>
      <div className="ai-code-body">
        {block.commands.length ? (
          block.commands.map((command, index) => {
            const verification = verifications[command]
            const verified = verification?.status === 'verified' && !pending
            const fillTitle = !sessionId
              ? 'Connect a session first'
              : pending
                ? 'Checking this command against the local catalog…'
                : verification?.status === 'verified'
                  ? 'Put this line in the prompt without pressing Enter'
                  : verification?.status === 'documented'
                    ? verification.source === 'device-help'
                      ? 'Device help reference only. Choose a curated command in the command browser to enable Fill.'
                      : 'Documented reference only. Choose a curated command in the command browser to enable Fill.'
                    : 'Not in the local device catalog. Verify it on the device first.'
            return (
              <div className="ai-command-wrap" key={`${command}-${index}`}>
                <div className="ai-command-line">
                  <code>{command}</code>
                  <button
                    className="ai-fill-btn"
                    disabled={!sessionId || !verified}
                    onClick={() => fill(command)}
                    title={fillTitle}
                  >
                    <CornerDownLeft size={12} /> Fill
                  </button>
                </div>
                <GroundingStatus verification={verification} pending={pending} />
              </div>
            )
          })
        ) : (
          <pre>{block.code}</pre>
        )}
      </div>
    </div>
  )
}

function InlineCommand({
  code,
  verification,
  pending
}: {
  code: string
  verification?: CommandVerification
  pending: boolean
}): React.JSX.Element {
  const pane = useAppStore(activePane)
  const fill = useFillCommand()
  const connected = pane?.status === 'connected' && Boolean(pane.sessionId)
  const verified = verification?.status === 'verified' && !pending
  return (
    <button
      className={cx('ai-inline-command', verification?.status)}
      disabled={!connected || !verified}
      onClick={() => fill(code)}
      title={
        !connected
          ? 'Connect a session first'
          : pending
            ? 'Checking this command against the local catalog…'
            : verified
              ? 'Place this command in the prompt without pressing Enter'
              : verification?.source === 'device-help'
                ? 'Device help reference only. Use the command browser to choose a curated command.'
                : 'Unverified command. Use the command browser to choose a curated command.'
      }
    >
      <code>{code}</code>
      <CornerDownLeft size={9} />
    </button>
  )
}

function InlineText({
  content,
  verifications,
  pending
}: {
  content: string
  verifications: Record<string, CommandVerification>
  pending: boolean
}): React.JSX.Element {
  const parts = content.split(/(`[^`\n]+`)/g)
  return (
    <div className="ai-text">
      {parts.map((part, index) => {
        if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
          const code = part.slice(1, -1).trim()
          if (looksLikeCommand(code)) {
            return (
              <InlineCommand
                code={code}
                verification={verifications[code]}
                pending={pending}
                key={`inline-${index}`}
              />
            )
          }
          return <code key={`code-${index}`}>{code}</code>
        }
        return <span key={`text-${index}`}>{part}</span>
      })}
    </div>
  )
}

function AssistantMessage({
  message,
  streaming = false
}: {
  message: AiChatMessage
  streaming?: boolean
}): React.JSX.Element {
  const originalSegments = parseAiContent(message.content)
  const commands = originalSegments.flatMap((segment) =>
    segment.kind === 'code'
      ? segment.block.commands
      : extractInlineCommands(segment.content)
  )
  const settings = useAppStore((state) => state.settings)
  const pane = useAppStore(activePane)
  const deviceTypeId = pane?.deviceTypeId || pane?.session?.deviceType || '__none__'
  const deviceType = useAppStore((state) =>
    state.catalog.types.find((type) => type.id === deviceTypeId)
  )
  const strict = settings.aiStrictCommands
  const strictForThisDevice = strict && deviceTypeId === 'cisco-asa'
  const [verifications, setVerifications] = useState<Record<string, CommandVerification>>({})
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const unique = [...new Set(commands)].filter(Boolean)
    setVerifications({})
    setChecked(false)
    if (streaming || unique.length === 0) return
    let cancelled = false
    void window.tsterm.commands
      .verify({
        commands: unique,
        strict: settings.aiStrictCommands && deviceTypeId === 'cisco-asa',
        deviceTypeId
      })
      .then((result) => {
        if (cancelled) return
        setVerifications(
          Object.fromEntries(result.results.map((verification) => [verification.command, verification]))
        )
        setChecked(true)
      })
      .catch(() => {
        if (cancelled) return
        setVerifications(
          Object.fromEntries(
            unique.map((command) => [
              command,
              {
                command,
                status: 'unknown' as const,
                reason: 'The local catalog check failed. Verify it on the device.'
              }
            ])
          )
        )
        setChecked(true)
      })
    return () => {
      cancelled = true
    }
    // Verification is keyed to the completed answer text and ground mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.content, streaming, settings.aiStrictCommands, deviceTypeId])

  const pending = streaming || (commands.length > 0 && !checked)
  const allowed = (command: string): boolean => {
    const verification = verifications[command]
    return Boolean(
      verification &&
        (verification.status === 'verified' ||
          (verification.status === 'documented' && verification.source === 'device-help'))
    )
  }
  const redacted = strictForThisDevice
    ? pending
      ? redactUnverifiedCommands(message.content, () => false)
      : redactUnverifiedCommands(message.content, allowed)
    : { content: message.content, removed: [] as string[] }
  const segments = parseAiContent(redacted.content)
  const visibleCommands = segments.flatMap((segment) =>
    segment.kind === 'code'
      ? segment.block.commands
      : extractInlineCommands(segment.content)
  )
  const hiddenCount = redacted.removed.length
  const counts = commands.reduce(
    (state, command) => {
      const verification = verifications[command]
      if (verification?.status === 'verified') state.verified += 1
      else if (verification?.status === 'documented' && verification.source === 'device-help') {
        state.deviceHelp += 1
      } else if (verification?.status === 'documented') state.documented += 1
      else if (verification?.status === 'unknown') state.unknown += 1
      return state
    },
    { verified: 0, deviceHelp: 0, documented: 0, unknown: 0 }
  )
  const { startsDebugOrCapture, hasCleanup, captureWarnings } = analyzeAiCommands(visibleCommands)

  return (
    <div className="ai-message assistant">
      <MessageAvatar role="assistant" />
      <div className="ai-message-body">
        <div className="ai-message-meta">
          <span>Assistant</span>
          <span className="ai-not-executed">suggestions only</span>
        </div>
        {commands.length || hiddenCount ? (
          <div
            className={cx(
              'ai-grounding-summary',
              pending
                ? 'pending'
                : strictForThisDevice
                  ? hiddenCount
                    ? 'unknown'
                    : 'verified'
                  : counts.unknown
                    ? 'unknown'
                    : counts.documented
                      ? 'documented'
                      : 'verified'
            )}
          >
            {pending ? (
              <>
                <Loader2 size={12} className="spin" /> Checking {commands.length} command
                {commands.length === 1 ? '' : 's'} against the local catalog…
              </>
            ) : strictForThisDevice ? (
              hiddenCount ? (
                <>
                  <AlertTriangle size={12} /> {hiddenCount} command
                  {hiddenCount === 1 ? '' : 's'} hidden — not in the ASA 9.24(10) catalog. Showing only
                  verified commands.
                </>
              ) : counts.deviceHelp ? (
                <>
                  <ShieldCheck size={12} /> All {counts.verified + counts.deviceHelp} commands recognized
                  in the ASA 9.24(10) catalog ({counts.verified} curated, {counts.deviceHelp} device help).
                </>
              ) : (
                <>
                  <ShieldCheck size={12} /> All {counts.verified} command
                  {counts.verified === 1 ? '' : 's'} verified in the local ASA catalog.
                </>
              )
            ) : counts.unknown ? (
              <>
                <AlertTriangle size={12} /> {counts.unknown} of {commands.length} command
                {commands.length === 1 ? '' : 's'} not found in the local catalog. Review before running;
                Fill is disabled.
              </>
            ) : counts.documented || counts.deviceHelp ? (
              <>
                <BookOpen size={12} /> {counts.documented + counts.deviceHelp} reference-only command
                {counts.documented + counts.deviceHelp === 1 ? '' : 's'}; Fill is disabled until an exact
                curated match.
              </>
            ) : (
              <>
                <ShieldCheck size={12} /> All {counts.verified} command
                {counts.verified === 1 ? '' : 's'} verified in the local {deviceType?.name ?? 'device'}{' '}
                catalog.
              </>
            )}
          </div>
        ) : null}
        {startsDebugOrCapture ? (
          <div className={cx('ai-cleanup-check', hasCleanup ? 'ok' : 'warn')}>
            {hasCleanup ? <Check size={12} /> : <ShieldCheck size={12} />}
            <span>
              {hasCleanup
                ? 'A cleanup command is included in this answer. Still review both sides.'
                : 'No cleanup command found for the debug/capture in this answer. Do not run it until you have a stop command.'}
            </span>
          </div>
        ) : null}
        {captureWarnings.length ? (
          <div className="ai-capture-warning">
            <AlertTriangle size={13} />
            <div>
              <strong>Check this ASA capture syntax</strong>
              {captureWarnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          </div>
        ) : null}
        {segments.map((segment, index) =>
          segment.kind === 'text' ? (
            <InlineText
              content={segment.content}
              verifications={verifications}
              pending={pending}
              key={`text-${index}`}
            />
          ) : (
            <CommandBlock
              block={segment.block}
              stateChanging={analyzeAiCommands(segment.block.commands).stateChanging}
              verifications={verifications}
              pending={pending}
              key={`code-${index}`}
            />
          )
        )}
        {streaming ? <span className="ai-stream-cursor" aria-hidden="true" /> : null}
      </div>
    </div>
  )
}

function UserMessage({ message }: { message: AiChatMessage }): React.JSX.Element {
  return (
    <div className="ai-message user">
      <MessageAvatar role="user" />
      <div className="ai-message-body">
        <div className="ai-message-meta">
          <span>You</span>
        </div>
        <div className="ai-text">{message.content}</div>
      </div>
    </div>
  )
}

const SUGGESTIONS = [
  'This device is dropping traffic. What should I check first?',
  'Help me configure this device with a rollback plan.',
  'Review the recent terminal output and suggest the next step.',
  'Give me a safe packet capture with the exact cleanup command.'
]

export function AiChatPanel(): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const pane = useAppStore(activePane)
  const catalog = useAppStore((state) => state.catalog)
  const keyIds = useAppStore((state) => state.aiKeyIds)
  const referenceDocs = useAppStore((state) => state.referenceDocs)
  const paneKey = pane?.id ?? ''
  const thread = useAppStore((state) =>
    paneKey ? state.aiThreads[paneKey] : undefined
  ) ?? EMPTY_AI_THREAD
  const setAiThread = useAppStore((state) => state.setAiThread)
  const setModal = useAppStore((state) => state.setModal)
  const localModel = useLocalModelState()

  const { messages, draft, busy, streamingText, error } = thread
  const [contextOn, setContextOn] = useState(settings.aiIncludeContext)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const activeTypeId = pane?.deviceTypeId || pane?.session?.deviceType
  const type = catalog.types.find((item) => item.id === activeTypeId)
  const profile =
    settings.aiProfiles.find((item) => item.id === settings.aiActiveProfileId) ??
    settings.aiProfiles[0]
  const sessionId = pane?.status === 'connected' ? pane.sessionId : undefined
  const referenceCount = referenceDocs.filter(
    (doc) => !doc.deviceTypeId || doc.deviceTypeId === activeTypeId
  ).length
  const isLocal = Boolean(profile?.local && isLoopbackUrl(profile.baseUrl))
  const localState =
    isLocal &&
    localModel.profileId === profile?.id &&
    localModel.model === profile?.model &&
    localModel.baseUrl === profile?.baseUrl
      ? localModel
      : null
  const localBlocked = Boolean(
    localState && ['pulling', 'installing', 'missing', 'error'].includes(localState.phase)
  )
  const localNeedsRuntime = Boolean(
    localState?.status?.ok === false && localState.status.needsRuntime
  )
  const canChat = Boolean(settings.aiEnabled && profile?.model && !localBlocked)
  const needsKey = Boolean(profile && profile.authStyle !== 'none' && !keyIds.includes(profile.id))

  useEffect(() => {
    setContextOn(settings.aiIncludeContext)
  }, [settings.aiIncludeContext])

  useEffect(() => {
    if (!settings.aiEnabled || !profile?.model || !isLocal) return
    void ensureLocalModel(profile, { autoPull: settings.aiAutoPullLocalModels })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.aiEnabled,
    settings.aiAutoPullLocalModels,
    profile?.id,
    profile?.baseUrl,
    profile?.model,
    isLocal
  ])

  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages, busy, streamingText])

  const toggleContext = (): void => {
    const next = !contextOn
    setContextOn(next)
    saveSettings({ aiIncludeContext: next })
  }

  const cancel = (): void => {
    if (paneKey) cancelAiMessage(paneKey)
  }

  const send = (promptOverride?: string): void => {
    if (!paneKey) return
    void sendAiMessage(paneKey, promptOverride)
  }

  const setDraft = (value: string): void => {
    if (paneKey) setAiThread(paneKey, { draft: value })
  }

  const clearChat = (): void => {
    if (paneKey) clearAiThread(paneKey)
  }


  if (!settings.aiEnabled) {
    return (
      <div className="ai-panel">
        <div className="ai-opt-in">
          <div className="ai-opt-in-icon">
            <Bot size={24} />
          </div>
          <span className="ai-eyebrow">
            <Sparkles size={11} /> Optional
          </span>
          <h3>AI device engineer</h3>
          <p>
            Ask for diagnosis, configuration help, or a safe change plan, and have commands placed in the
            prompt for review. The assistant has no terminal access and can never run anything.
          </p>
          <ul className="ai-safety-list">
            <li>
              <Check size={13} /> Off until you enable it
            </li>
            <li>
              <Check size={13} /> Never executes device commands
            </li>
            <li>
              <Check size={13} /> Works with local Ollama or LM Studio
            </li>
            <li>
              <Check size={13} /> Or use your own API subscription
            </li>
          </ul>
          <div className="ai-opt-in-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                saveSettings({ aiEnabled: true })
                setModal({ kind: 'settings', tab: 'ai' })
              }}
            >
              <Bot size={14} /> Set up AI assistant
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setModal({ kind: 'settings', tab: 'ai' })}>
              Choose provider
            </button>
          </div>
          <p className="ai-fineprint">
            Local models keep everything on this computer. Cloud providers receive only what you send plus
            optional device context.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="ai-panel">
      <div className="ai-topline">
        <div className="ai-provider">
          <span className={cx('ai-status-dot', busy && 'busy')} />
          <div>
            <strong>{profileLabel(profile)}</strong>
            <span>{profile?.model || 'Choose a model'}</span>
          </div>
        </div>
        <div className="ai-topline-actions">
          <button
            className="icon-btn tiny"
            onClick={() =>
              setModal({
                kind: 'command-browser',
                query: draft.trim() || undefined,
                sessionId,
                deviceTypeId: activeTypeId
              })
            }
            aria-label="Open the device command reference"
            title="Command reference"
          >
            <Search size={13} />
          </button>
          <button
            className={cx('icon-btn tiny', settings.aiStrictCommands && 'active-toggle')}
            onClick={() => saveSettings({ aiStrictCommands: !settings.aiStrictCommands })}
            aria-label="Toggle strict command grounding"
            title={
              settings.aiStrictCommands
                ? 'Strict command grounding is on'
                : 'Strict command grounding is off'
            }
          >
            <ShieldCheck size={13} />
          </button>
          {referenceCount > 0 ? (
            <button
              className="icon-btn tiny"
              onClick={() => setModal({ kind: 'settings', tab: 'ai' })}
              aria-label={`Open reference library, ${referenceCount} documents`}
              title={`Reference library (${referenceCount})`}
            >
              <BookOpen size={13} />
            </button>
          ) : null}
          <button
            className={cx('ai-context-chip', contextOn && 'on')}
            onClick={toggleContext}
            title={contextOn ? 'Live terminal output is included' : 'Live terminal output is not included'}
          >
            {contextOn ? <Eye size={11} /> : <EyeOff size={11} />}
            {contextOn ? 'Context' : 'No context'}
          </button>
          <button
            className="icon-btn tiny"
            onClick={clearChat}
            disabled={!messages.length || busy}
            aria-label="New chat"
            title="New chat"
          >
            <Eraser size={13} />
          </button>
        </div>
      </div>

      {!type ? (
        <div className="ai-scope-line warn">
          <BookOpen size={11} />
          <span>Select a device type to scope the assistant and its commands.</span>
        </div>
      ) : null}

      {profile && isSmallModelName(profile.model) ? (
        <div className="ai-model-quality-banner">
          <ShieldCheck size={12} />
          <span>
            <strong>{profile.model}</strong> is a small model and may give generic answers.
          </span>
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => setModal({ kind: 'settings', tab: 'ai' })}
          >
            Switch model
          </button>
        </div>
      ) : null}

      {isLocal && localState && localState.phase === 'checking' ? (
        <div className="ai-local-banner checking">
          <Loader2 size={14} className="spin" />
          <div className="ai-local-banner-copy">
            <strong>Checking the local model</strong>
            <span>Looking for Ollama and {profile?.model}.</span>
          </div>
        </div>
      ) : null}

      {isLocal && localState && localState.phase === 'installing' ? (
        <div className="ai-local-banner installing">
          <Loader2 size={14} className="spin" />
          <div className="ai-local-banner-copy">
            <strong>Installing Ollama</strong>
            <span>Downloading and running the official Ollama installer. This can take a few minutes.</span>
          </div>
        </div>
      ) : null}

      {isLocal && localState && localState.phase === 'pulling' ? (
        <div className="ai-local-banner pulling">
          <Download size={14} />
          <div className="ai-local-banner-copy">
            <strong>{localPullStatusLabel(localState.progress?.status)}</strong>
            <div className="ai-local-bar">
              <i
                className={localState.percent === undefined ? 'indeterminate' : undefined}
                style={
                  localState.percent !== undefined ? { width: `${localState.percent}%` } : undefined
                }
              />
            </div>
            <span>
              {localState.percent !== undefined ? `${localState.percent}%` : 'Starting…'}
              {localState.progress?.completed !== undefined && localState.progress?.total
                ? ` · ${formatModelBytes(localState.progress.completed)} of ${formatModelBytes(localState.progress.total)}`
                : ''}
            </span>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={cancelLocalModelPull}>
            <X size={11} /> Cancel
          </button>
        </div>
      ) : null}

      {isLocal &&
      localState &&
      (localState.phase === 'missing' || localState.phase === 'error') ? (
        <div className={cx('ai-local-banner', localState.phase)}>
          {localState.phase === 'error' ? <ShieldCheck size={14} /> : <Download size={14} />}
          <div className="ai-local-banner-copy">
            <strong>
              {localState.phase === 'error'
                ? 'Local model download failed'
                : localNeedsRuntime
                  ? 'Ollama is not available'
                  : 'Local model is not installed'}
            </strong>
            <span>{localState.error || `${profile?.model} needs to be downloaded.`}</span>
          </div>
          {localNeedsRuntime ? (
            <>
              <button
                className="btn btn-primary btn-xs"
                onClick={() =>
                  profile &&
                  void installLocalRuntime(profile, {
                    autoPull: settings.aiAutoPullLocalModels
                  })
                }
              >
                <Download size={11} /> Install Ollama
              </button>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => profile && void ensureLocalModel(profile, { autoPull: true, force: true })}
              >
                Retry
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary btn-xs"
              onClick={() =>
                profile && void ensureLocalModel(profile, { autoPull: true, force: true })
              }
            >
              <Download size={11} /> Download
            </button>
          )}
        </div>
      ) : null}

      {needsKey || !profile?.model ? (
        <div className="ai-inline-warning">
          <KeyRound size={13} />
          <span>
            {!profile?.model
              ? 'Pick a model for this provider.'
              : 'This provider needs an API key. It is stored with the OS keychain.'}
          </span>
          <button className="btn btn-ghost btn-xs" onClick={() => setModal({ kind: 'settings', tab: 'ai' })}>
            Open settings
          </button>
        </div>
      ) : null}

      <div className="ai-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="ai-empty">
            <div className="ai-empty-icon">
              <Bot size={22} />
            </div>
            <h3>What are you seeing?</h3>
            <p>
              Describe the symptom. The assistant can use the device type, the open runbooks, and the last
              lines of terminal output when context is on.
            </p>
            <div className="ai-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} onClick={() => void send(suggestion)} disabled={!canChat || busy}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) =>
            message.role === 'assistant' ? (
              <AssistantMessage message={message} key={`assistant-${index}`} />
            ) : (
              <UserMessage message={message} key={`user-${index}`} />
            )
          )
        )}

        {busy && streamingText ? (
          <AssistantMessage
            message={{ role: 'assistant', content: streamingText }}
            streaming
          />
        ) : busy ? (
          <div className="ai-message assistant">
            <MessageAvatar role="assistant" />
            <div className="ai-message-body">
              <div className="ai-typing" aria-label="Assistant is thinking">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="ai-error">
            <strong>Request failed</strong>
            <span>{error}</span>
            <button className="btn btn-ghost btn-xs" onClick={() => setModal({ kind: 'settings', tab: 'ai' })}>
              Provider settings
            </button>
          </div>
        ) : null}
      </div>

      <div className="ai-composer">
        <textarea
          ref={inputRef}
          value={draft}
          rows={2}
          placeholder={
            canChat
              ? 'Describe a symptom, a configuration goal, or ask what to check…'
              : localState?.phase === 'installing'
                ? 'Installing Ollama…'
                : localNeedsRuntime
                  ? 'Install Ollama, then retry.'
                  : localBlocked
                    ? 'Download the local model first.'
                    : 'Choose a provider and model first'
          }
          disabled={!canChat}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
        />
        {busy ? (
          <button className="btn btn-sm ai-stop" onClick={cancel}>
            <CircleStop size={14} /> Stop
          </button>
        ) : (
          <button
            className="btn btn-primary btn-sm ai-send"
            onClick={() => void send()}
            disabled={!canChat || !draft.trim()}
            title={
              isCommandRequest(draft)
                ? 'Opens the command browser with this query; commands come from the local catalog'
                : 'Ask the assistant'
            }
          >
            {isCommandRequest(draft) ? <Search size={14} /> : <Send size={14} />}
            {isCommandRequest(draft) ? 'Find command' : 'Ask'}
          </button>
        )}
      </div>
      <div className="ai-disclaimer">
        <ShieldCheck size={11} />
        TSTerm AI can only suggest commands. Every command is your decision and your keystroke.
      </div>
    </div>
  )
}
