import { isCommandRequest, isLoopbackUrl } from '@shared/ai-utils'
import type { AiChatMessage, AsaCommandRecord } from '@shared/types'
import { buildRetrievalQuery, collectAiContext } from './ai-context'
import { getLocalModelState } from './ai-local'
import { useAppStore, type AppStore, type PaneState } from '../store'

let streamUnsub: (() => void) | null = null

function formatCommandHint(record: AsaCommandRecord): string {
  const sourceNote =
    record.source === 'device-help'
      ? ` (device help ${record.version}, reference only)`
      : record.referenceOnly
        ? ' (documentation reference, not device-verified)'
        : ''
  return [
    `### ${record.commandTemplate}`,
    record.description,
    `Risk: ${record.risk} · Mode: ${record.mode} · Source: ${record.source}${sourceNote}`,
    record.referenceOnly && record.syntax ? `Syntax: ${record.syntax}` : '',
    record.parameters.length
      ? `Parameters: ${record.parameters
          .map((parameter) => `${parameter.name}${parameter.required ? '*' : ''}`)
          .join(', ')}`
      : '',
    record.cleanup.length ? `Cleanup: ${record.cleanup.join(' · ')}` : ''
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 1200)
}

function findPane(state: AppStore, paneKey: string): PaneState | undefined {
  for (const tab of state.tabs) {
    const pane = tab.panes.find((item) => item.id === paneKey)
    if (pane) return pane
  }
  return undefined
}

export function initAiChatStreaming(): () => void {
  if (streamUnsub) return streamUnsub
  const unsubscribe = window.tsterm.ai.onChatStream((event) => {
    const state = useAppStore.getState()
    for (const [key, thread] of Object.entries(state.aiThreads)) {
      if (thread.requestId !== event.requestId) continue
      state.setAiThread(key, { streamingText: thread.streamingText + event.text })
      return
    }
  })
  streamUnsub = () => {
    unsubscribe()
    streamUnsub = null
  }
  return streamUnsub
}

export async function sendAiMessage(
  paneKey: string,
  promptOverride?: string
): Promise<void> {
  const state = useAppStore.getState()
  const pane = findPane(state, paneKey)
  if (!pane) return

  const thread = state.aiThreads[paneKey]
  if (thread?.busy) return
  const prompt = (promptOverride ?? thread?.draft ?? '').trim()
  if (!prompt) return
  if (!state.settings.aiEnabled) return

  if (promptOverride === undefined && isCommandRequest(prompt)) {
    state.setAiThread(paneKey, { draft: '' })
    state.setModal({
      kind: 'command-browser',
      query: prompt,
      sessionId: pane.status === 'connected' ? pane.sessionId : undefined
    })
    state.notify({
      kind: 'info',
      title: 'Command browser',
      message: 'Command requests are answered from the local ASA catalog. Only verified commands can be filled.'
    })
    return
  }

  const profile =
    state.settings.aiProfiles.find((item) => item.id === state.settings.aiActiveProfileId) ??
    state.settings.aiProfiles[0]
  if (!profile) {
    state.notify({ kind: 'error', title: 'No AI provider', message: 'Configure one in AI settings.' })
    return
  }
  if (!profile.model) {
    state.notify({ kind: 'warning', title: 'No model selected', message: 'Choose a model in AI settings.' })
    return
  }

  const local = getLocalModelState()
  if (
    profile.local &&
    isLoopbackUrl(profile.baseUrl) &&
    local.model === profile.model &&
    ['pulling', 'installing', 'missing', 'error'].includes(local.phase)
  ) {
    state.notify({
      kind: 'warning',
      title: 'Local model is not ready',
      message: 'Wait for the model to finish installing, then try again.'
    })
    return
  }

  const previousMessages = thread?.messages ?? []
  const nextMessages: AiChatMessage[] = [...previousMessages, { role: 'user', content: prompt }]
  const requestId = crypto.randomUUID()
  state.setAiThread(paneKey, {
    messages: nextMessages,
    draft: '',
    busy: true,
    requestId,
    streamingText: '',
    error: undefined
  })

  try {
    const aiContext = collectAiContext({
      includeContext: state.settings.aiIncludeContext,
      prompt,
      pane
    })
    const retrievalQuery = buildRetrievalQuery(
      prompt,
      aiContext.terminalTail,
      aiContext.currentCommand
    )
    let referenceHints: string[] = []
    let commandHints: string[] = []
    const typeId = pane.deviceTypeId || pane.session?.deviceType
    const referenceCount = useAppStore
      .getState()
      .referenceDocs.filter((doc) => !doc.deviceTypeId || doc.deviceTypeId === typeId).length
    if (referenceCount > 0) {
      try {
        const references = await window.tsterm.references.search({
          query: retrievalQuery,
          deviceTypeId: typeId,
          limit: 4
        })
        if (references.ok) {
          referenceHints = references.matches.map(
            (match) => `### Reference: ${match.docName}\n${match.excerpt}`
          )
        }
      } catch {
        // Reference retrieval is best-effort.
      }
    }
    try {
      const catalog = await window.tsterm.commands.search({
        query: retrievalQuery,
        limit: 6,
        useVector: true,
        includeReference: !state.settings.aiStrictCommands,
        includeDeviceHelp: true
      })
      commandHints = catalog.matches.map((match) => formatCommandHint(match.record))
    } catch {
      // Command catalog retrieval is best-effort.
    }

    const result = await window.tsterm.ai.chat({
      requestId,
      profileId: profile.id,
      messages: nextMessages.slice(-12),
      includeContext: state.settings.aiIncludeContext,
      context: {
        ...aiContext,
        referenceHints,
        commandHints,
        strictCommands: state.settings.aiStrictCommands
      }
    })

    const latest = useAppStore.getState().aiThreads[paneKey]
    if (!latest || latest.requestId !== requestId) return
    const partial = latest.streamingText.trim()

    if (result.ok) {
      useAppStore.getState().setAiThread(paneKey, {
        messages: [...nextMessages, { role: 'assistant', content: result.text }],
        busy: false,
        requestId: undefined,
        streamingText: '',
        error: undefined
      })
    } else if (result.cancelled) {
      useAppStore.getState().setAiThread(paneKey, {
        messages: partial
          ? [...nextMessages, { role: 'assistant', content: partial }]
          : nextMessages,
        busy: false,
        requestId: undefined,
        streamingText: '',
        error: undefined
      })
      useAppStore.getState().notify({ kind: 'info', title: 'AI request stopped' })
    } else {
      useAppStore.getState().setAiThread(paneKey, {
        messages: partial
          ? [...nextMessages, { role: 'assistant', content: partial }]
          : nextMessages,
        busy: false,
        requestId: undefined,
        streamingText: '',
        error: result.error
      })
    }
  } catch (error) {
    const latest = useAppStore.getState().aiThreads[paneKey]
    if (!latest || latest.requestId !== requestId) return
    const partial = latest.streamingText.trim()
    useAppStore.getState().setAiThread(paneKey, {
      messages: partial
        ? [...nextMessages, { role: 'assistant', content: partial }]
        : nextMessages,
      busy: false,
      requestId: undefined,
      streamingText: '',
      error: (error as Error).message
    })
  }
}

export function cancelAiMessage(paneKey: string): void {
  const thread = useAppStore.getState().aiThreads[paneKey]
  if (thread?.requestId) void window.tsterm.ai.cancel(thread.requestId)
}

export function clearAiThread(paneKey: string): void {
  cancelAiMessage(paneKey)
  useAppStore.getState().setAiThread(paneKey, {
    messages: [],
    draft: '',
    busy: false,
    requestId: undefined,
    streamingText: '',
    error: undefined
  })
}
