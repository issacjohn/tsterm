import { isLoopbackUrl } from '@shared/ai-utils'
import type { AiChatMessage } from '@shared/types'
import { collectAiContext } from './ai-context'
import { getLocalModelState } from './ai-local'
import { useAppStore, type AppStore, type PaneState } from '../store'

let streamUnsub: (() => void) | null = null

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
    let referenceHints: string[] = []
    const typeId = pane.deviceTypeId || pane.session?.deviceType
    const referenceCount = useAppStore
      .getState()
      .referenceDocs.filter((doc) => !doc.deviceTypeId || doc.deviceTypeId === typeId).length
    if (referenceCount > 0) {
      try {
        const references = await window.tsterm.references.search({
          query: prompt,
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

    const result = await window.tsterm.ai.chat({
      requestId,
      profileId: profile.id,
      messages: nextMessages.slice(-12),
      includeContext: state.settings.aiIncludeContext,
      context: {
        ...collectAiContext({
          includeContext: state.settings.aiIncludeContext,
          prompt,
          pane
        }),
        referenceHints
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
