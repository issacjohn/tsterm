import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Store } from '../src/main/store'
import { UpdateService } from '../src/main/updates'

interface FakeState {
  lastCheckedAt?: string
}

const state: FakeState = {}
const fakeStore = {
  getUpdateState: () => ({ ...state }),
  setLastUpdateCheck: (iso: string) => {
    state.lastCheckedAt = iso
  }
} as unknown as Store

function release(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      tag_name: 'v0.2.0',
      name: 'TSTerm 0.2.0',
      body: 'Faster captures.\nCleaner cleanup.',
      html_url: 'https://github.com/example/tsterm/releases/tag/v0.2.0',
      published_at: '2026-11-01T00:00:00Z',
      ...overrides
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

describe('update service', () => {
  beforeEach(() => {
    state.lastCheckedAt = undefined
    process.env.TSTERM_UPDATE_REPO = 'example/tsterm'
  })

  afterEach(() => {
    delete process.env.TSTERM_UPDATE_REPO
    vi.unstubAllGlobals()
  })

  it('finds a newer GitHub release', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => release()))
    const service = new UpdateService(fakeStore, '0.1.0')
    const result = await service.check(true)
    expect(result.checked).toBe(true)
    expect(result.available).toBe(true)
    expect(result.update).toMatchObject({
      currentVersion: '0.1.0',
      latestVersion: '0.2.0',
      name: 'TSTerm 0.2.0'
    })
    expect(result.update?.url).toContain('/releases/tag/v0.2.0')
    expect(state.lastCheckedAt).toBeTruthy()
  })

  it('does not prompt twice in the same day unless forced', async () => {
    state.lastCheckedAt = new Date().toISOString()
    const fetchMock = vi.fn(async () => release())
    vi.stubGlobal('fetch', fetchMock)
    const service = new UpdateService(fakeStore, '0.1.0')
    const result = await service.check(false)
    expect(result.checked).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats an older release as up to date', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => release({ tag_name: 'v0.0.9' })))
    const service = new UpdateService(fakeStore, '0.1.0')
    const result = await service.check(true)
    expect(result.available).toBe(false)
  })

  it('explains when no release exists yet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    const service = new UpdateService(fakeStore, '0.1.0')
    const result = await service.check(true)
    expect(result.checked).toBe(true)
    expect(result.available).toBe(false)
    expect(result.reason).toContain('No releases')
  })

  it('returns a friendly message when GitHub is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      })
    )
    const service = new UpdateService(fakeStore, '0.1.0')
    const result = await service.check(true)
    expect(result.checked).toBe(true)
    expect(result.available).toBe(false)
    expect(result.reason).toContain('Could not reach GitHub')
  })
})
