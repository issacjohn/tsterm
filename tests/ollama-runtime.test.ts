import { describe, expect, it, vi } from 'vitest'
import { installOllamaRuntime } from '../src/main/ollama-runtime'

describe('Ollama runtime installer', () => {
  it('reuses an already running Ollama', async () => {
    const install = vi.fn(async () => {})
    const result = await installOllamaRuntime({
      platform: 'win32',
      probe: async () => '0.9.0',
      install
    })
    expect(result).toEqual({ ok: true, version: '0.9.0' })
    expect(install).not.toHaveBeenCalled()
  })

  it('returns a manual fallback on non-Windows platforms', async () => {
    const install = vi.fn(async () => {})
    const result = await installOllamaRuntime({
      platform: 'linux',
      probe: async () => undefined,
      install
    })
    expect(result.ok).toBe(false)
    expect(result.manual).toBe(true)
    expect(result.downloadUrl).toContain('ollama.com')
    expect(install).not.toHaveBeenCalled()
  })

  it('installs with winget and waits for the API', async () => {
    let calls = 0
    const install = vi.fn(async () => {})
    const result = await installOllamaRuntime({
      platform: 'win32',
      probe: async () => {
        calls += 1
        return calls >= 2 ? '0.9.1' : undefined
      },
      install,
      waitMs: 500,
      pollMs: 1
    })
    expect(result).toEqual({ ok: true, version: '0.9.1' })
    expect(install).toHaveBeenCalledTimes(1)
  })

  it('reports installer failures with a manual download fallback', async () => {
    const result = await installOllamaRuntime({
      platform: 'win32',
      probe: async () => undefined,
      install: async () => {
        throw new Error('winget is blocked')
      }
    })
    expect(result.ok).toBe(false)
    expect(result.manual).toBe(true)
    expect(result.error).toContain('winget is blocked')
    expect(result.downloadUrl).toContain('ollama.com')
  })

  it('starts the tray app if the API is not up yet, then reports a clear failure', async () => {
    const start = vi.fn()
    const result = await installOllamaRuntime({
      platform: 'win32',
      probe: async () => undefined,
      install: async () => {},
      start,
      waitMs: 0,
      postStartWaitMs: 0,
      pollMs: 1
    })
    expect(start).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not responding')
    expect(result.downloadUrl).toContain('ollama.com')
  })
})
