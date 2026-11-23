import { useSyncExternalStore } from 'react'
import type { AiLocalStatusResult, AiProfile, AiPullProgressEvent } from '@shared/types'
import { isLoopbackUrl } from '@shared/ai-utils'
import { useAppStore } from '../store'

export type LocalModelPhase =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'missing'
  | 'pulling'
  | 'installing'
  | 'error'
  | 'unsupported'

export interface LocalModelState {
  phase: LocalModelPhase
  profileId?: string
  profileName?: string
  model?: string
  baseUrl?: string
  status?: AiLocalStatusResult
  progress?: AiPullProgressEvent
  percent?: number
  error?: string
}

let state: LocalModelState = { phase: 'idle' }
const listeners = new Set<() => void>()
let progressUnsub: (() => void) | null = null
let activeKey = ''
let activeRequestId: string | null = null
let inFlight: Promise<void> | null = null
let inFlightKey = ''
let installInFlight: Promise<void> | null = null
let queuedProfile: AiProfile | undefined
let queuedOptions: EnsureLocalModelOptions | undefined

function publish(next: LocalModelState): void {
  state = next
  for (const listener of listeners) listener()
}

function ensureProgressListener(): void {
  if (progressUnsub) return
  progressUnsub = window.tsterm.ai.onPullProgress((event) => {
    if (event.requestId !== activeRequestId) return
    publish({
      ...state,
      phase: 'pulling',
      progress: event,
      percent: event.percent
    })
  })
}

export function subscribeLocalModel(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getLocalModelState(): LocalModelState {
  return state
}

export function useLocalModelState(): LocalModelState {
  return useSyncExternalStore(subscribeLocalModel, getLocalModelState, getLocalModelState)
}

export function cancelLocalModelPull(): void {
  if (activeRequestId) void window.tsterm.ai.cancel(activeRequestId)
}

export function formatModelBytes(value: number | undefined): string {
  if (!value || value <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let amount = value
  let index = 0
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024
    index += 1
  }
  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

export function localPullStatusLabel(status: string | undefined): string {
  if (!status) return 'Downloading model…'
  if (status === 'pulling manifest') return 'Fetching model manifest…'
  if (status.startsWith('pulling ')) return 'Downloading model layers…'
  if (status === 'verifying sha256 digest') return 'Verifying download…'
  if (status === 'writing manifest') return 'Finishing install…'
  if (status.startsWith('removing')) return 'Cleaning up…'
  if (status === 'success') return 'Installed'
  return status
}

function statusBase(profile: AiProfile): Pick<LocalModelState, 'profileId' | 'profileName' | 'model' | 'baseUrl'> {
  return {
    profileId: profile.id,
    profileName: profile.name,
    model: profile.model,
    baseUrl: profile.baseUrl
  }
}

async function pullModel(profile: AiProfile): Promise<void> {
  const requestId = crypto.randomUUID()
  activeRequestId = requestId
  publish({
    ...statusBase(profile),
    phase: 'pulling',
    progress: { requestId, status: 'starting', percent: 0 },
    percent: 0
  })

  try {
    const result = await window.tsterm.ai.pullModel({
      requestId,
      profile,
      model: profile.model
    })
    activeRequestId = null
    if (result.ok) {
      const refreshed = await window.tsterm.ai.localStatus({
        profile,
        model: profile.model
      })
      const ready = refreshed.ok && refreshed.modelReady
      if (refreshed.ok) {
        publish({
          ...statusBase(profile),
          phase: ready ? 'ready' : 'error',
          status: refreshed,
          error: ready
            ? undefined
            : 'The model downloaded, but Ollama did not list it as ready.'
        })
      } else {
        publish({
          ...statusBase(profile),
          phase: 'error',
          status: refreshed,
          error: refreshed.error
        })
      }
      useAppStore.getState().notify(
        ready
          ? {
              kind: 'success',
              title: 'Local model ready',
              message: `${profile.model} is installed in Ollama.`,
              duration: 6000
            }
          : {
              kind: 'warning',
              title: 'Model downloaded, but not verified',
              message: 'Open AI settings and click Retry.',
              duration: 8000
            }
      )
      return
    }

    if (result.cancelled) {
      publish({
        ...statusBase(profile),
        phase: 'missing',
        error: 'Download cancelled.'
      })
      useAppStore.getState().notify({ kind: 'info', title: 'Model download cancelled' })
      return
    }

    publish({
      ...statusBase(profile),
      phase: 'error',
      error: result.error
    })
    useAppStore.getState().notify({
      kind: 'error',
      title: 'Model download failed',
      message: result.error,
      duration: 10000
    })
  } catch (error) {
    activeRequestId = null
    const message = (error as Error).message
    publish({
      ...statusBase(profile),
      phase: 'error',
      error: message
    })
    useAppStore.getState().notify({
      kind: 'error',
      title: 'Model download failed',
      message,
      duration: 10000
    })
  }
}

export interface EnsureLocalModelOptions {
  autoPull?: boolean
  force?: boolean
}

export interface InstallLocalRuntimeOptions {
  autoPull?: boolean
}

export async function installLocalRuntime(
  profile: AiProfile,
  options: InstallLocalRuntimeOptions = {}
): Promise<void> {
  if (installInFlight) return installInFlight
  const run = (async () => {
    publish({ ...statusBase(profile), phase: 'installing' })
    let result: Awaited<ReturnType<typeof window.tsterm.ai.installRuntime>>
    try {
      result = await window.tsterm.ai.installRuntime()
    } catch (error) {
      result = { ok: false, error: (error as Error).message }
    }

    if (result.ok) {
      useAppStore.getState().notify({
        kind: 'success',
        title: 'Ollama installed',
        message: result.version ? `Ollama ${result.version} is running.` : 'Ollama is running.',
        duration: 6000
      })
      await ensureLocalModel(profile, {
        autoPull: options.autoPull ?? true,
        force: true
      })
      return
    }

    const message = result.error || 'Ollama could not be installed automatically.'
    publish({
      ...statusBase(profile),
      phase: 'missing',
      status: {
        ok: false,
        runtime: 'ollama',
        baseUrl: profile.baseUrl,
        needsRuntime: true,
        error: message
      },
      error: message
    })
    useAppStore.getState().notify({
      kind: 'error',
      title: 'Ollama install failed',
      message: result.manual
        ? `${message} You can install it from ollama.com.`
        : message,
      duration: 12000
    })
  })()

  installInFlight = run
  try {
    await run
  } finally {
    if (installInFlight === run) installInFlight = null
  }
}

/**
 * Checks the loopback Ollama endpoint and, when a model is missing, pulls it
 * through Ollama's native API. Downloads are deduplicated and survive the
 * settings panel closing.
 */
export async function ensureLocalModel(
  profile: AiProfile | undefined,
  options: EnsureLocalModelOptions = {}
): Promise<void> {
  if (!profile || !profile.model || !isLoopbackUrl(profile.baseUrl)) return
  const key = `${profile.id}|${profile.baseUrl}|${profile.model}`
  if (inFlight) {
    if (inFlightKey !== key) {
      queuedProfile = profile
      queuedOptions = options
      // A provider switch should not leave the old model downloading for
      // minutes while the new endpoint shows nothing. Ollama keeps completed
      // layers, so this is safe to resume later.
      cancelLocalModelPull()
    }
    return inFlight
  }
  if (
    !options.force &&
    activeKey === key &&
    (state.phase === 'pulling' || state.phase === 'checking' || state.phase === 'ready')
  ) {
    return
  }

  activeKey = key
  ensureProgressListener()
  publish({ ...statusBase(profile), phase: 'checking' })

  const run = (async () => {
    let status: AiLocalStatusResult
    try {
      status = await window.tsterm.ai.localStatus({
        profile,
        model: profile.model
      })
    } catch (error) {
      publish({
        ...statusBase(profile),
        phase: 'error',
        error: (error as Error).message
      })
      return
    }

    if (!status.ok) {
      publish({
        ...statusBase(profile),
        phase: status.runtime === 'unknown' ? 'unsupported' : 'missing',
        status,
        error: status.error
      })
      if (options.force) {
        useAppStore.getState().notify({
          kind: 'error',
          title: status.needsRuntime ? 'Ollama is not available' : 'Local model check failed',
          message: status.error,
          duration: 12000
        })
      }
      return
    }

    publish({
      ...statusBase(profile),
      phase: status.modelReady ? 'ready' : 'missing',
      status
    })
    if (status.modelReady) return

    if (options.autoPull === false) return
    await pullModel(profile)
  })()

  inFlight = run
  inFlightKey = key
  try {
    await run
  } finally {
    if (inFlight === run) {
      inFlight = null
      inFlightKey = ''
    }
    if (queuedProfile) {
      const nextProfile = queuedProfile
      const nextOptions = queuedOptions ?? {}
      queuedProfile = undefined
      queuedOptions = undefined
      void ensureLocalModel(nextProfile, nextOptions)
    }
  }
}
