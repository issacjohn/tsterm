import type { UpdateCheckResult, UpdateInfo } from '@shared/types'
import { UPDATE_REPO, updateChecksConfigured } from '@shared/update-config'
import type { Store } from './store'

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '')
}

function isNewer(latest: string, current: string): boolean {
  const a = normalizeVersion(latest).split(/[.+-]/).map((part) => Number(part) || 0)
  const b = normalizeVersion(current).split(/[.+-]/).map((part) => Number(part) || 0)
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0
    const right = b[index] ?? 0
    if (left > right) return true
    if (left < right) return false
  }
  return false
}

export class UpdateService {
  private inFlight: Promise<UpdateCheckResult> | null = null

  constructor(
    private readonly store: Store,
    private readonly currentVersion: string
  ) {}

  check(force = false): Promise<UpdateCheckResult> {
    if (this.inFlight) return this.inFlight
    this.inFlight = this.run(force).finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async run(force: boolean): Promise<UpdateCheckResult> {
    const state = this.store.getUpdateState()
    const repo = process.env.TSTERM_UPDATE_REPO || UPDATE_REPO
    const configured =
      Boolean(process.env.TSTERM_UPDATE_REPO) || (updateChecksConfigured() && !repo.startsWith('OWNER/'))
    if (!configured) {
      return {
        checked: false,
        available: false,
        reason: 'Update checks are not configured for this build yet.'
      }
    }
    if (!force && state.lastCheckedAt) {
      const elapsed = Date.now() - new Date(state.lastCheckedAt).getTime()
      if (Number.isFinite(elapsed) && elapsed < 24 * 60 * 60 * 1000) {
        return { checked: false, available: false, lastCheckedAt: state.lastCheckedAt }
      }
    }

    const now = new Date().toISOString()
    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'TSTerm-Update-Check'
      }
      if (process.env.TSTERM_GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.TSTERM_GITHUB_TOKEN}`
      const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers,
        signal: AbortSignal.timeout(12000)
      })
      this.store.setLastUpdateCheck(now)
      if (response.status === 404) {
        return {
          checked: true,
          available: false,
          reason: 'No releases have been published yet.',
          lastCheckedAt: now
        }
      }
      if (!response.ok) {
        return {
          checked: true,
          available: false,
          reason: `GitHub returned HTTP ${response.status}.`,
          lastCheckedAt: now
        }
      }
      const release = (await response.json()) as {
        tag_name?: string
        name?: string
        body?: string
        html_url?: string
        published_at?: string
      }
      const latestVersion = normalizeVersion(release.tag_name || release.name || '')
      if (!latestVersion) {
        return { checked: true, available: false, reason: 'The latest release has no version tag.', lastCheckedAt: now }
      }
      if (!isNewer(latestVersion, this.currentVersion)) {
        return { checked: true, available: false, lastCheckedAt: now }
      }
      const update: UpdateInfo = {
        currentVersion: normalizeVersion(this.currentVersion),
        latestVersion,
        name: release.name || `TSTerm ${latestVersion}`,
        notes: release.body || '',
        url: release.html_url || `https://github.com/${repo}/releases/latest`,
        publishedAt: release.published_at
      }
      return { checked: true, available: true, update, lastCheckedAt: now }
    } catch (error) {
      this.store.setLastUpdateCheck(now)
      return {
        checked: true,
        available: false,
        reason: `Could not reach GitHub: ${(error as Error).message}`,
        lastCheckedAt: now
      }
    }
  }
}
