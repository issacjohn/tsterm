export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[index]}`
}

export function timeAgo(iso: string | undefined): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return 'never'
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (seconds < 45) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

export function formatDuration(startedAt: string | undefined): string {
  if (!startedAt) return ''
  const start = new Date(startedAt).getTime()
  if (!Number.isFinite(start)) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${s}s`
  return `${s}s`
}

export function truncate(value: string, length: number): string {
  if (value.length <= length) return value
  return `${value.slice(0, Math.max(0, length - 1))}…`
}

export function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export function isMac(platform: string): boolean {
  return platform === 'darwin'
}

export function modifierLabel(platform: string): string {
  return isMac(platform) ? '⌘' : 'Ctrl'
}
