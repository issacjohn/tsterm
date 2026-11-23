import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { AiRuntimeInstallResult } from '@shared/types'

const execFileAsync = promisify(execFile)
const DOWNLOAD_URL = 'https://ollama.com/download'
const DEFAULT_WAIT_MS = 90_000

async function probeOllama(): Promise<string | undefined> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2500)
  try {
    const response = await fetch('http://127.0.0.1:11434/api/version', {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
    if (!response.ok) return undefined
    const data = (await response.json()) as { version?: string }
    return typeof data.version === 'string' ? data.version : undefined
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

function wingetPath(): string {
  const local = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'winget.exe')
    : ''
  return local && fs.existsSync(local) ? local : 'winget'
}

async function runWingetInstall(): Promise<void> {
  await execFileAsync(
    wingetPath(),
    [
      'install',
      '--id',
      'Ollama.Ollama',
      '--exact',
      '--silent',
      '--accept-package-agreements',
      '--accept-source-agreements'
    ],
    {
      windowsHide: true,
      timeout: 300_000,
      maxBuffer: 4 * 1024 * 1024
    }
  )
}

function startOllamaApp(): void {
  if (process.platform !== 'win32') return
  const local = process.env.LOCALAPPDATA
  if (!local) return
  const app = path.join(local, 'Programs', 'Ollama', 'ollama app.exe')
  if (!fs.existsSync(app)) return
  try {
    spawn(app, [], { detached: true, stdio: 'ignore' }).unref()
  } catch {
    // The user can start Ollama manually; the API probe will still fail clearly.
  }
}

async function waitForProbe(
  probe: () => Promise<string | undefined>,
  timeoutMs: number,
  pollMs: number
): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs
  while (true) {
    const version = await probe()
    if (version) return version
    if (Date.now() >= deadline) return undefined
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}

export interface OllamaInstallOptions {
  platform?: NodeJS.Platform
  probe?: () => Promise<string | undefined>
  install?: () => Promise<void>
  start?: () => void
  waitMs?: number
  postStartWaitMs?: number
  pollMs?: number
}

/**
 * Installs Ollama through winget on Windows. The command is fixed and uses no
 * shell, so no user or model-supplied text reaches the process arguments.
 */
export async function installOllamaRuntime(
  options: OllamaInstallOptions = {}
): Promise<AiRuntimeInstallResult> {
  const platform = options.platform ?? process.platform
  const probe = options.probe ?? probeOllama
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS
  const pollMs = options.pollMs ?? 1500

  const existing = await probe()
  if (existing) return { ok: true, version: existing }

  if (platform !== 'win32') {
    return {
      ok: false,
      manual: true,
      downloadUrl: DOWNLOAD_URL,
      error:
        'Automatic installation is available on Windows only. Install Ollama from ollama.com, then retry.'
    }
  }

  try {
    await (options.install ?? runWingetInstall)()
  } catch (error) {
    return {
      ok: false,
      manual: true,
      downloadUrl: DOWNLOAD_URL,
      error: `Could not install Ollama automatically. ${(error as Error).message}`.trim()
    }
  }

  let version = await waitForProbe(probe, waitMs, pollMs)
  if (!version) {
    ;(options.start ?? startOllamaApp)()
    version = await waitForProbe(probe, options.postStartWaitMs ?? 20_000, pollMs)
  }
  if (version) return { ok: true, version }

  return {
    ok: false,
    manual: true,
    downloadUrl: DOWNLOAD_URL,
    error:
      'Ollama was installed but is not responding yet. Start Ollama from the Start menu, then retry.'
  }
}
