import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { safeStorage } from 'electron'
import { DEFAULT_SETTINGS, TERMINAL_THEMES } from '@shared/themes'
import type {
  AiAuthStyle,
  AiProfile,
  AiProviderKind,
  AppPaths,
  AppSettings,
  DebugSession,
  Host,
  HostInput,
  HostSaveResult,
  KnownHost,
  Snippet,
  SnippetInput,
  TrustHostInput
} from '@shared/types'

const FILES = {
  hosts: 'hosts.json',
  settings: 'settings.json',
  snippets: 'snippets.json',
  knownHosts: 'known_hosts.json',
  debugSessions: 'debug_sessions.json',
  secrets: 'secrets.json',
  aiSecrets: 'ai-secrets.json'
}

interface AiSecretsFile {
  version: 1
  values: Record<string, string>
}

interface StoredSecret {
  password?: string
  passphrase?: string
}

interface SecretsFile {
  version: 1
  values: Record<string, string>
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback
  return value.filter((item): item is string => typeof item === 'string')
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

interface UpdateState {
  lastCheckedAt?: string
}

function sanitizeAiProfiles(value: unknown): AiProfile[] {
  if (value === undefined) return structuredClone(DEFAULT_SETTINGS.aiProfiles)
  if (!Array.isArray(value)) return structuredClone(DEFAULT_SETTINGS.aiProfiles)
  const profiles: AiProfile[] = []
  const ids = new Set<string>()
  for (const item of value.slice(0, 16)) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Partial<AiProfile>
    const id = typeof raw.id === 'string' ? raw.id.trim().toLowerCase() : ''
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id) || ids.has(id)) continue
    let baseUrl = typeof raw.baseUrl === 'string' ? raw.baseUrl.trim() : ''
    try {
      const parsed = new URL(baseUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) continue
    } catch {
      continue
    }
    const kind: AiProviderKind = raw.kind === 'anthropic' ? 'anthropic' : 'openai-compatible'
    const authStyle: AiAuthStyle =
      raw.authStyle === 'x-api-key' || raw.authStyle === 'api-key' || raw.authStyle === 'none'
        ? raw.authStyle
        : 'bearer'
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : id
    const model = typeof raw.model === 'string' ? raw.model.trim().slice(0, 120) : ''
    const maxTokens = Math.round(clamp(Number(raw.maxTokens) || 1024, 64, 8192))
    const temperature = clamp(Number(raw.temperature) || 0, 0, 2)
    let local = Boolean(raw.local)
    try {
      const host = new URL(baseUrl).hostname
      local = local || ['127.0.0.1', 'localhost', '::1'].includes(host)
    } catch {
      // baseUrl already validated
    }
    ids.add(id)
    profiles.push({
      id,
      name,
      kind,
      baseUrl: baseUrl.replace(/\/+$/, ''),
      model,
      authStyle,
      maxTokens,
      temperature,
      local
    })
  }
  if (value.length > 0 && profiles.length === 0) return structuredClone(DEFAULT_SETTINGS.aiProfiles)
  return profiles
}

function sanitizeSettings(input: unknown): AppSettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<AppSettings>
  const merged: AppSettings = { ...DEFAULT_SETTINGS, ...raw }

  const themeIds = TERMINAL_THEMES.map((theme) => theme.id)
  if (merged.terminalThemeId !== 'custom' && !themeIds.includes(merged.terminalThemeId)) {
    merged.terminalThemeId = DEFAULT_SETTINGS.terminalThemeId
  }
  if (!['midnight', 'graphite', 'daylight'].includes(merged.appTheme)) {
    merged.appTheme = DEFAULT_SETTINGS.appTheme
  }
  merged.fontSize = clamp(asNumber(merged.fontSize, 14), 8, 36)
  merged.lineHeight = clamp(asNumber(merged.lineHeight, 1.16), 0.85, 2.2)
  merged.letterSpacing = clamp(asNumber(merged.letterSpacing, 0), -2, 4)
  merged.ghostOpacity = clamp(asNumber(merged.ghostOpacity, 0.4), 0.05, 0.8)
  merged.scrollback = Math.round(clamp(asNumber(merged.scrollback, 10000), 500, 200000))
  merged.uiScale = clamp(asNumber(merged.uiScale, 1), 0.8, 1.3)
  merged.sidebarSize = clamp(asNumber(merged.sidebarSize, 22), 12, 45)
  merged.troubleshootSize = clamp(asNumber(merged.troubleshootSize, 28), 18, 55)
  merged.keepaliveSeconds = Math.round(clamp(asNumber(merged.keepaliveSeconds, 30), 0, 300))
  merged.fontWeight = ['300', '400', '500', '600', '700'].includes(merged.fontWeight)
    ? merged.fontWeight
    : '400'
  merged.cursorStyle = ['block', 'underline', 'bar'].includes(merged.cursorStyle)
    ? merged.cursorStyle
    : 'bar'
  merged.suggestionAcceptKey = ['tab', 'right'].includes(merged.suggestionAcceptKey)
    ? merged.suggestionAcceptKey
    : 'tab'
  merged.density = merged.density === 'compact' ? 'compact' : 'comfortable'
  merged.bellStyle = merged.bellStyle === 'sound' ? 'sound' : 'none'
  merged.uiFontFamily = asString(merged.uiFontFamily, DEFAULT_SETTINGS.uiFontFamily)
  merged.fontFamily = asString(merged.fontFamily, DEFAULT_SETTINGS.fontFamily)
  merged.localShell = asString(merged.localShell, '')
  merged.localShellArgs = asStringArray(merged.localShellArgs, [])
  merged.skippedUpdateVersion = asString(merged.skippedUpdateVersion, '') || undefined
  merged.aiProfiles = sanitizeAiProfiles(raw.aiProfiles)
  // The built-in Ollama profile used to default to llama3.2. Move that specific
  // default forward without touching a custom profile or a deliberate choice.
  const builtInOllama = merged.aiProfiles.find((profile) => profile.id === 'local-ollama')
  if (builtInOllama?.model === 'llama3.2') builtInOllama.model = 'qwen3:8b'
  merged.aiActiveProfileId = asString(merged.aiActiveProfileId, '') || undefined
  if (
    merged.aiActiveProfileId &&
    !merged.aiProfiles.some((profile) => profile.id === merged.aiActiveProfileId)
  ) {
    merged.aiActiveProfileId = merged.aiProfiles[0]?.id
  }
  if (!merged.aiActiveProfileId) merged.aiActiveProfileId = merged.aiProfiles[0]?.id
  merged.schemaVersion = 1

  const boolKeys: Array<keyof AppSettings> = [
    'fontLigatures',
    'cursorBlink',
    'copyOnSelect',
    'rightClickPaste',
    'confirmMultilinePaste',
    'inlineSuggestions',
    'showSidebar',
    'showTroubleshootPanel',
    'logSessions',
    'strictHostKeyChecking',
    'clickableLinks',
    'sftpShowHidden',
    'reduceMotion',
    'autoCheckUpdates',
    'aiEnabled',
    'aiIncludeContext',
    'aiAutoPullLocalModels'
  ]
  const mergedRecord = merged as unknown as Record<string, unknown>
  const defaultsRecord = DEFAULT_SETTINGS as unknown as Record<string, unknown>
  for (const key of boolKeys) {
    if (typeof mergedRecord[key] !== 'boolean') {
      mergedRecord[key] = defaultsRecord[key]
    }
  }

  if (merged.customTerminalTheme && merged.customTerminalTheme.id !== 'custom') {
    merged.customTerminalTheme = { ...merged.customTerminalTheme, id: 'custom' }
  }
  return merged
}

export class Store {
  readonly paths: AppPaths
  readonly warnings: string[] = []
  private hosts: Host[] = []
  private settings: AppSettings
  private snippets: Snippet[] = []
  private knownHosts: KnownHost[] = []
  private debugSessions: DebugSession[] = []
  private secrets: SecretsFile
  private aiSecrets: AiSecretsFile
  private ephemeral = new Map<string, StoredSecret>()
  private aiEphemeral = new Map<string, string>()

  constructor(baseDir: string) {
    this.paths = {
      appData: baseDir,
      catalog: path.join(baseDir, 'catalog'),
      customCatalog: path.join(baseDir, 'catalog'),
      logs: path.join(baseDir, 'logs'),
      exports: path.join(baseDir, 'exports')
    }
    fs.mkdirSync(baseDir, { recursive: true })
    fs.mkdirSync(this.paths.catalog, { recursive: true })
    fs.mkdirSync(this.paths.logs, { recursive: true })
    fs.mkdirSync(this.paths.exports, { recursive: true })

    this.settings = sanitizeSettings(this.readJson(FILES.settings, {}))
    this.hosts = this.readJson<Host[]>(FILES.hosts, []).filter((host) => this.isValidHost(host))
    this.snippets = this.readJson<Snippet[]>(FILES.snippets, []).filter(Boolean)
    this.knownHosts = this.readJson<KnownHost[]>(FILES.knownHosts, []).filter(Boolean)
    this.debugSessions = this.readJson<DebugSession[]>(FILES.debugSessions, []).filter(Boolean)
    this.secrets = this.readJson<SecretsFile>(FILES.secrets, { version: 1, values: {} })
    if (!this.secrets.values) this.secrets = { version: 1, values: {} }
    this.aiSecrets = this.readJson<AiSecretsFile>(FILES.aiSecrets, { version: 1, values: {} })
    if (!this.aiSecrets.values) this.aiSecrets = { version: 1, values: {} }
    this.refreshHostSecretFlags()
  }

  private file(name: string): string {
    return path.join(this.paths.appData, name)
  }

  private readJson<T>(name: string, fallback: T): T {
    const file = this.file(name)
    try {
      if (!fs.existsSync(file)) return fallback
      const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim()
      if (!raw) return fallback
      return JSON.parse(raw) as T
    } catch (error) {
      this.warnings.push(`Could not read ${name}: ${(error as Error).message}`)
      try {
        fs.renameSync(file, `${file}.corrupt-${Date.now()}`)
      } catch {
        // best effort
      }
      return fallback
    }
  }

  private writeJson(name: string, data: unknown): void {
    const file = this.file(name)
    const tmp = `${file}.${process.pid}.tmp`
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tmp, file)
  }

  private isValidHost(value: unknown): value is Host {
    if (!value || typeof value !== 'object') return false
    const host = value as Host
    return typeof host.id === 'string' && typeof host.hostname === 'string' && typeof host.label === 'string'
  }

  private refreshHostSecretFlags(): void {
    for (const host of this.hosts) {
      const secret = this.secrets.values[host.id]
      host.hasStoredPassword = Boolean(secret)
      host.hasStoredPassphrase = Boolean(secret)
    }
  }

  getSettings(): AppSettings {
    return structuredClone(this.settings)
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    this.settings = sanitizeSettings({ ...this.settings, ...patch })
    this.writeJson(FILES.settings, this.settings)
    return this.getSettings()
  }

  resetSettings(): AppSettings {
    this.settings = structuredClone(DEFAULT_SETTINGS)
    this.writeJson(FILES.settings, this.settings)
    return this.getSettings()
  }

  getHosts(): Host[] {
    this.refreshHostSecretFlags()
    return structuredClone(this.hosts)
  }

  getHost(id: string): Host | undefined {
    this.refreshHostSecretFlags()
    const host = this.hosts.find((item) => item.id === id)
    return host ? structuredClone(host) : undefined
  }

  saveHost(input: HostInput): HostSaveResult {
    if (!input.hostname || !input.hostname.trim()) throw new Error('Hostname is required.')
    if (!input.username || !input.username.trim()) throw new Error('Username is required.')
    const port = Math.round(clamp(Number(input.port) || 22, 1, 65535))
    const now = new Date().toISOString()
    const existing = input.id ? this.hosts.find((host) => host.id === input.id) : undefined
    if (input.id && !existing) throw new Error('Host not found.')

    const host: Host = {
      id: existing?.id ?? randomUUID(),
      label: input.label?.trim() || input.hostname.trim(),
      hostname: input.hostname.trim(),
      port,
      username: input.username.trim(),
      authType: input.authType,
      privateKeyPath: input.privateKeyPath?.trim() || undefined,
      group: input.group?.trim() || undefined,
      tags: Array.from(new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))),
      deviceType: input.deviceType?.trim() || undefined,
      color: input.color?.trim() || existing?.color,
      jumpHostId: input.jumpHostId && input.jumpHostId !== existing?.id ? input.jumpHostId : undefined,
      startupCommand: input.startupCommand?.trim() || undefined,
      keepaliveSeconds:
        typeof input.keepaliveSeconds === 'number' ? Math.round(input.keepaliveSeconds) : undefined,
      notes: input.notes?.trim() || undefined,
      favorite: Boolean(input.favorite),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastConnectedAt: existing?.lastConnectedAt
    }

    let secretSaved = false
    let warning: string | undefined
    if (input.savePassword && (input.password || input.passphrase)) {
      const merged: StoredSecret = {
        ...(this.getSecret(host.id) ?? {}),
        ...(input.password ? { password: input.password } : {}),
        ...(input.passphrase ? { passphrase: input.passphrase } : {})
      }
      const encrypted = this.encryptSecret(merged)
      if (encrypted) {
        this.secrets.values[host.id] = encrypted
        this.ephemeral.delete(host.id)
        secretSaved = true
      } else {
        this.ephemeral.set(host.id, merged)
        warning = 'OS credential encryption is unavailable. The password is kept in memory for this run only.'
      }
    } else if (!input.savePassword) {
      delete this.secrets.values[host.id]
      this.ephemeral.delete(host.id)
    }

    this.writeJson(FILES.secrets, this.secrets)
    if (existing) {
      this.hosts = this.hosts.map((item) => (item.id === host.id ? host : item))
    } else {
      this.hosts.push(host)
    }
    this.writeJson(FILES.hosts, this.hosts)
    this.refreshHostSecretFlags()
    const saved = this.getHost(host.id)!
    return { hosts: this.getHosts(), host: saved, secretSaved, warning }
  }

  deleteHost(id: string): Host[] {
    this.hosts = this.hosts.filter((host) => host.id !== id)
    delete this.secrets.values[id]
    this.ephemeral.delete(id)
    this.writeJson(FILES.hosts, this.hosts)
    this.writeJson(FILES.secrets, this.secrets)
    return this.getHosts()
  }

  setHostDeviceType(id: string, deviceType: string): Host[] {
    const host = this.hosts.find((item) => item.id === id)
    if (!host) throw new Error('Host not found.')
    host.deviceType = deviceType || undefined
    host.updatedAt = new Date().toISOString()
    this.writeJson(FILES.hosts, this.hosts)
    return this.getHosts()
  }

  touchHost(id: string): void {
    const host = this.hosts.find((item) => item.id === id)
    if (!host) return
    host.lastConnectedAt = new Date().toISOString()
    this.writeJson(FILES.hosts, this.hosts)
  }

  getSecret(id: string): StoredSecret | undefined {
    if (this.ephemeral.has(id)) return this.ephemeral.get(id)
    const encrypted = this.secrets.values[id]
    if (!encrypted) return undefined
    try {
      if (!safeStorage.isEncryptionAvailable()) return undefined
      const json = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      return JSON.parse(json) as StoredSecret
    } catch {
      return undefined
    }
  }

  setEphemeralSecret(id: string, secret: StoredSecret): void {
    this.ephemeral.set(id, secret)
  }

  private encryptSecret(secret: StoredSecret): string | null {
    try {
      if (!safeStorage.isEncryptionAvailable()) return null
      return safeStorage.encryptString(JSON.stringify(secret)).toString('base64')
    } catch {
      return null
    }
  }

  getAiKeyIds(): string[] {
    return [...new Set([...Object.keys(this.aiSecrets.values), ...this.aiEphemeral.keys()])].sort()
  }

  getAiKey(profileId: string): string | undefined {
    if (this.aiEphemeral.has(profileId)) return this.aiEphemeral.get(profileId)
    const encrypted = this.aiSecrets.values[profileId]
    if (!encrypted) return undefined
    try {
      if (!safeStorage.isEncryptionAvailable()) return undefined
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      return undefined
    }
  }

  saveAiKey(profileId: string, key: string): boolean {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(profileId)) throw new Error('Invalid AI profile id.')
    const value = key.trim().slice(0, 8192)
    if (!value) return false
    try {
      if (safeStorage.isEncryptionAvailable()) {
        this.aiSecrets.values[profileId] = safeStorage.encryptString(value).toString('base64')
        this.aiEphemeral.delete(profileId)
        this.writeJson(FILES.aiSecrets, this.aiSecrets)
        return true
      }
    } catch {
      // fall through to session-only
    }
    this.aiEphemeral.set(profileId, value)
    return false
  }

  deleteAiKey(profileId: string): void {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(profileId)) throw new Error('Invalid AI profile id.')
    delete this.aiSecrets.values[profileId]
    this.aiEphemeral.delete(profileId)
    this.writeJson(FILES.aiSecrets, this.aiSecrets)
  }

  getSecretsForExport(): Record<string, StoredSecret> {
    return {}
  }

  mergeImportedHosts(inputs: HostInput[]): { hosts: Host[]; imported: number; errors: string[] } {
    const errors: string[] = []
    let imported = 0
    const byKey = new Map(
      this.hosts.map((host) => [`${host.hostname.toLowerCase()}:${host.port}:${host.username}`, host])
    )
    for (const input of inputs) {
      try {
        const key = `${input.hostname.toLowerCase()}:${Number(input.port) || 22}:${input.username}`
        const existing = byKey.get(key)
        const saved = this.saveHost({ ...input, id: existing?.id, savePassword: false })
        imported += 1
        const host = saved.host
        byKey.set(key, host)
      } catch (error) {
        errors.push(`${input.label || input.hostname}: ${(error as Error).message}`)
      }
    }
    return { hosts: this.getHosts(), imported, errors }
  }

  exportableHosts(): Array<Omit<Host, 'hasStoredPassword' | 'hasStoredPassphrase'>> {
    return this.hosts.map(({ hasStoredPassword: _password, hasStoredPassphrase: _passphrase, ...host }) => host)
  }

  getSnippets(): Snippet[] {
    return structuredClone(this.snippets)
  }

  saveSnippet(input: SnippetInput): Snippet[] {
    if (!input.title.trim() || !input.command.trim()) throw new Error('Snippet title and command are required.')
    const now = new Date().toISOString()
    const existing = input.id ? this.snippets.find((snippet) => snippet.id === input.id) : undefined
    const snippet: Snippet = {
      id: existing?.id ?? randomUUID(),
      title: input.title.trim(),
      command: input.command,
      description: input.description?.trim() || undefined,
      tags: Array.from(new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))),
      deviceTypeId: input.deviceTypeId?.trim() || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    if (existing) {
      this.snippets = this.snippets.map((item) => (item.id === snippet.id ? snippet : item))
    } else {
      this.snippets.push(snippet)
    }
    this.writeJson(FILES.snippets, this.snippets)
    return this.getSnippets()
  }

  deleteSnippet(id: string): Snippet[] {
    this.snippets = this.snippets.filter((snippet) => snippet.id !== id)
    this.writeJson(FILES.snippets, this.snippets)
    return this.getSnippets()
  }

  getKnownHosts(): KnownHost[] {
    return structuredClone(this.knownHosts)
  }

  findKnownHost(hostname: string, port: number): KnownHost | undefined {
    return this.knownHosts.find(
      (entry) => entry.hostname.toLowerCase() === hostname.toLowerCase() && entry.port === port
    )
  }

  trustHost(input: TrustHostInput): KnownHost[] {
    const existing = this.findKnownHost(input.hostname, input.port)
    if (existing) {
      existing.fingerprint = input.fingerprint
      existing.keyType = input.keyType
      existing.addedAt = new Date().toISOString()
    } else {
      this.knownHosts.push({
        id: randomUUID(),
        hostname: input.hostname,
        port: input.port,
        fingerprint: input.fingerprint,
        keyType: input.keyType,
        addedAt: new Date().toISOString()
      })
    }
    this.writeJson(FILES.knownHosts, this.knownHosts)
    return this.getKnownHosts()
  }

  removeKnownHost(id: string): KnownHost[] {
    this.knownHosts = this.knownHosts.filter((entry) => entry.id !== id)
    this.writeJson(FILES.knownHosts, this.knownHosts)
    return this.getKnownHosts()
  }

  getDebugSessions(): DebugSession[] {
    return structuredClone(this.debugSessions)
  }

  saveDebugSessions(sessions: DebugSession[]): DebugSession[] {
    this.debugSessions = structuredClone(sessions)
    this.writeJson(FILES.debugSessions, this.debugSessions)
    return this.getDebugSessions()
  }

  cleanupFile(content: string): string {
    const file = path.join(this.paths.exports, `cleanup-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`)
    fs.writeFileSync(file, content, 'utf8')
    return file
  }

  getUpdateState(): UpdateState {
    return this.readJson<UpdateState>('updates.json', {})
  }

  setLastUpdateCheck(iso: string): void {
    this.writeJson('updates.json', { ...this.getUpdateState(), lastCheckedAt: iso })
  }
}
