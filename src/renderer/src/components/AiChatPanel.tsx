import { useEffect, useRef, useState } from 'react'
import {
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
  Send,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  X
} from 'lucide-react'
import type { AiChatMessage, AiProfile } from '@shared/types'
import { isLoopbackUrl, isSmallModelName } from '@shared/ai-utils'
import { activePane, useAppStore } from '../store'
import { saveSettings } from '../lib/session-actions'
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
  collectAiContext,
  extractInlineCommands,
  fillTerminalPrompt,
  looksLikeCommand,
  parseAiContent,
  saveCommandsAsSnippet,
  type AiBlock
} from '../lib/ai-context'
import { cx, truncate } from '../lib/format'

function profileLabel(profile: AiProfile | undefined): string {
  if (!profile) return 'No provider'
  return `${profile.name}${profile.local && !/local/i.test(profile.name) ? ' · local' : ''}`
}

function contextSummary(deviceName: string | undefined, hasTail: boolean): string {
  if (!deviceName && !hasTail) return 'No device context'
  if (deviceName && hasTail) return `${truncate(deviceName, 24)} + terminal output`
  return deviceName ? truncate(deviceName, 28) : 'Terminal output only'
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

function CommandBlock({
  block,
  stateChanging
}: {
  block: AiBlock
  stateChanging: boolean
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
          {block.language === 'text' ? 'commands' : block.language}
          {stateChanging ? <em className="ai-risk-badge">state-changing</em> : null}
        </span>
        <div className="ai-code-actions">
          <button className="btn btn-ghost btn-xs" onClick={() => void copyAll()} title="Copy all commands">
            <Copy size={11} /> Copy
          </button>
          <button className="btn btn-ghost btn-xs" onClick={() => void saveSnippet()} title="Save as a snippet">
            <Sparkles size={11} /> Snippet
          </button>
        </div>
      </div>
      <div className="ai-code-body">
        {block.commands.length ? (
          block.commands.map((command, index) => (
            <div className="ai-command-line" key={`${command}-${index}`}>
              <code>{command}</code>
              <button
                className="ai-fill-btn"
                disabled={!sessionId}
                onClick={() => fill(command)}
                title={sessionId ? 'Put this line in the prompt without pressing Enter' : 'Connect a session first'}
              >
                <CornerDownLeft size={12} /> Fill
              </button>
            </div>
          ))
        ) : (
          <pre>{block.code}</pre>
        )}
      </div>
      <div className="ai-code-foot">
        <ShieldCheck size={11} />
        Filling never presses Enter.
      </div>
    </div>
  )
}

function InlineCommand({ code }: { code: string }): React.JSX.Element {
  const pane = useAppStore(activePane)
  const fill = useFillCommand()
  const connected = pane?.status === 'connected' && Boolean(pane.sessionId)
  return (
    <button
      className="ai-inline-command"
      disabled={!connected}
      onClick={() => fill(code)}
      title={connected ? 'Place this command in the prompt without pressing Enter' : 'Connect a session first'}
    >
      <code>{code}</code>
      <CornerDownLeft size={9} />
    </button>
  )
}

function InlineText({ content }: { content: string }): React.JSX.Element {
  const parts = content.split(/(`[^`\n]+`)/g)
  return (
    <div className="ai-text">
      {parts.map((part, index) => {
        if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
          const code = part.slice(1, -1).trim()
          if (looksLikeCommand(code)) {
            return <InlineCommand code={code} key={`inline-${index}`} />
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
  const segments = parseAiContent(message.content)
  const commands = segments.flatMap((segment) =>
    segment.kind === 'code'
      ? segment.block.commands
      : extractInlineCommands(segment.content)
  )
  const { startsDebugOrCapture, hasCleanup } = analyzeAiCommands(commands)

  return (
    <div className="ai-message assistant">
      <MessageAvatar role="assistant" />
      <div className="ai-message-body">
        <div className="ai-message-meta">
          <span>Assistant</span>
          <span className="ai-not-executed">suggestions only</span>
        </div>
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
        {segments.map((segment, index) =>
          segment.kind === 'text' ? (
            <InlineText content={segment.content} key={`text-${index}`} />
          ) : (
            <CommandBlock
              block={segment.block}
              stateChanging={analyzeAiCommands(segment.block.commands).stateChanging}
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
  'Give me a safe packet capture with the exact cleanup command.',
  'Review the recent terminal output and suggest the next diagnostic step.',
  'Which read-only commands prove where the problem is?'
]

export function AiChatPanel(): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const pane = useAppStore(activePane)
  const catalog = useAppStore((state) => state.catalog)
  const keyIds = useAppStore((state) => state.aiKeyIds)
  const referenceDocs = useAppStore((state) => state.referenceDocs)
  const messages = useAppStore((state) => state.aiMessages)
  const draft = useAppStore((state) => state.aiDraft)
  const setMessages = useAppStore((state) => state.setAiMessages)
  const setDraft = useAppStore((state) => state.setAiDraft)
  const clearChat = useAppStore((state) => state.clearAiChat)
  const setModal = useAppStore((state) => state.setModal)
  const notify = useAppStore((state) => state.notify)
  const localModel = useLocalModelState()

  const [busy, setBusy] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [contextOn, setContextOn] = useState(settings.aiIncludeContext)
  const requestRef = useRef<string | null>(null)
  const streamingRef = useRef('')
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
    const unsubscribe = window.tsterm.ai.onChatStream((event) => {
      if (!requestRef.current || event.requestId !== requestRef.current) return
      streamingRef.current += event.text
      setStreamingText(streamingRef.current)
    })
    return unsubscribe
  }, [])

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
    if (requestRef.current) void window.tsterm.ai.cancel(requestRef.current)
  }

  const send = async (promptOverride?: string): Promise<void> => {
    const prompt = (promptOverride ?? draft).trim()
    if (!prompt || busy) return
    if (!settings.aiEnabled) return
    if (!profile) {
      setError('Choose an AI provider in Settings → AI assistant.')
      return
    }
    if (!profile.model) {
      setError('Choose a model for this provider in Settings → AI assistant.')
      return
    }

    const nextMessages: AiChatMessage[] = [...messages, { role: 'user', content: prompt }]
    const requestId = crypto.randomUUID()
    requestRef.current = requestId
    streamingRef.current = ''
    setStreamingText('')
    setMessages(nextMessages)
    setDraft('')
    setError(null)
    setBusy(true)
    try {
      let referenceHints: string[] = []
      if (referenceCount > 0) {
        try {
          const references = await window.tsterm.references.search({
            query: prompt,
            deviceTypeId: activeTypeId,
            limit: 6
          })
          if (references.ok) {
            referenceHints = references.matches.map(
              (match) => `### Reference: ${match.docName}\n${match.excerpt}`
            )
          }
        } catch {
          // Reference lookup is best-effort; never block the chat.
        }
      }
      const result = await window.tsterm.ai.chat({
        requestId,
        profileId: profile.id,
        messages: nextMessages.slice(-12),
        includeContext: settings.aiIncludeContext,
        context: {
          ...collectAiContext({
            includeContext: settings.aiIncludeContext,
            prompt
          }),
          referenceHints
        }
      })
      if (result.ok) {
        setMessages([...nextMessages, { role: 'assistant', content: result.text }])
      } else if (result.cancelled) {
        const partial = streamingRef.current.trim()
        if (partial) {
          setMessages([...nextMessages, { role: 'assistant', content: partial }])
        }
        notify({ kind: 'info', title: 'AI request stopped' })
      } else {
        const partial = streamingRef.current.trim()
        if (partial) {
          setMessages([...nextMessages, { role: 'assistant', content: partial }])
        }
        setError(result.error)
      }
    } catch (requestError) {
      const partial = streamingRef.current.trim()
      if (partial) {
        setMessages([...nextMessages, { role: 'assistant', content: partial }])
      }
      setError((requestError as Error).message)
    } finally {
      requestRef.current = null
      streamingRef.current = ''
      setStreamingText('')
      setBusy(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
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
          <h3>AI troubleshooting partner</h3>
          <p>
            Ask questions, get a diagnosis path, and have commands placed in the prompt for review. The
            assistant has no terminal access and can never run anything.
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
          {referenceCount > 0 ? (
            <button
              className="ai-reference-chip"
              onClick={() => setModal({ kind: 'settings', tab: 'ai' })}
              title="Open the AI reference library"
            >
              <BookOpen size={11} /> {referenceCount}
            </button>
          ) : null}
          <button
            className={cx('ai-context-chip', contextOn && 'on')}
            onClick={toggleContext}
            title={contextOn ? 'Live terminal output is included' : 'Live terminal output is not included'}
          >
            {contextOn ? <Eye size={11} /> : <EyeOff size={11} />}
            {contextOn ? 'Live context on' : 'Live context off'}
          </button>
          <button
            className="icon-btn tiny"
            onClick={clearChat}
            disabled={!messages.length || busy}
            title="New chat"
          >
            <Eraser size={13} />
          </button>
        </div>
      </div>

      <div className="ai-context-line">
        <ShieldCheck size={11} />
        <span>{contextSummary(type?.name, Boolean(contextOn && sessionId))}</span>
        {sessionId ? (
          <span className="ai-target">
            <span className="status-dot connected" /> {truncate(pane?.title ?? 'session', 22)}
          </span>
        ) : (
          <span className="ai-target muted">no live prompt</span>
        )}
      </div>

      <div className={cx('ai-scope-line', !type && 'warn')}>
        <BookOpen size={11} />
        <span>
          {type
            ? `${type.name} runbooks only — other device packs are ignored.`
            : 'No device type selected. Choose one in the session toolbar to scope the runbooks.'}
        </span>
      </div>

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
              ? 'Describe the symptom or ask what to check…'
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
          >
            <Send size={14} /> Ask
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
