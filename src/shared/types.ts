/**
 * Shared contracts between the Electron main process, preload bridge and the UI.
 * Keep this file free of Node and DOM imports.
 */

export type PlatformName = 'win32' | 'darwin' | 'linux' | string
export type AuthType = 'password' | 'key' | 'agent'
export type SessionKind = 'ssh' | 'local'
export type SessionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'
export type Severity = 'info' | 'caution' | 'danger'
export type WorkflowEffect = 'read' | 'debug' | 'capture' | 'change'
export type VariableType =
  | 'string'
  | 'ip'
  | 'ipv4'
  | 'ipv6'
  | 'int'
  | 'port'
  | 'choice'
  | 'interface'
  | 'mac'
  | 'hostname'
export type DeviceSource = 'bundled' | 'custom'
export type QuitAction = 'stop' | 'force' | 'cancel'
export type MenuCommand =
  | 'new-ssh'
  | 'new-local'
  | 'settings'
  | 'troubleshoot'
  | 'ai-assistant'
  | 'sftp'
  | 'close-tab'
  | 'reconnect'
  | 'command-palette'
  | 'shortcuts'

/* ------------------------------------------------------------------ hosts */

export interface Host {
  id: string
  label: string
  hostname: string
  port: number
  username: string
  authType: AuthType
  privateKeyPath?: string
  group?: string
  tags: string[]
  deviceType?: string
  color?: string
  jumpHostId?: string
  startupCommand?: string
  keepaliveSeconds?: number
  notes?: string
  favorite?: boolean
  hasStoredPassword?: boolean
  hasStoredPassphrase?: boolean
  createdAt: string
  updatedAt: string
  lastConnectedAt?: string
}

export interface HostInput {
  id?: string
  label: string
  hostname: string
  port: number
  username: string
  authType: AuthType
  privateKeyPath?: string
  group?: string
  tags?: string[]
  deviceType?: string
  color?: string
  jumpHostId?: string
  startupCommand?: string
  keepaliveSeconds?: number
  notes?: string
  favorite?: boolean
  savePassword?: boolean
  password?: string
  passphrase?: string
}

export interface HostSaveResult {
  hosts: Host[]
  host: Host
  secretSaved: boolean
  warning?: string
}

/* --------------------------------------------------------------- sessions */

export interface SessionInfo {
  id: string
  kind: SessionKind
  hostId?: string
  title: string
  subtitle?: string
  status: SessionStatus
  deviceType?: string
  shell?: string
  cols: number
  rows: number
  startedAt: string
  connectedAt?: string
  error?: string
  hostKeyFingerprint?: string
  logPath?: string
}

export interface ConnectSshOptions {
  hostId: string
  cols: number
  rows: number
  /** Ephemeral credentials when the host does not persist them. */
  password?: string
  passphrase?: string
  /** The fingerprint the user just approved; verified again during connect. */
  trustFingerprint?: string
}

export interface ConnectLocalOptions {
  cols: number
  rows: number
  shell?: string
  cwd?: string
  title?: string
}

export type ConnectErrorCode =
  | 'AUTH'
  | 'UNKNOWN_HOST_KEY'
  | 'HOST_KEY_MISMATCH'
  | 'NETWORK'
  | 'PTY_UNAVAILABLE'
  | 'UNKNOWN'

export interface ConnectError {
  code: ConnectErrorCode
  message: string
  fingerprint?: string
  keyType?: string
  hostname?: string
  port?: number
}

export type CreateResult =
  | { ok: true; session: SessionInfo }
  | { ok: false; error: ConnectError }

export interface TerminalDataEvent {
  terminalId: string
  data: string
}

export interface SessionStatusEvent {
  terminalId: string
  status: SessionStatus
  error?: string
  logPath?: string
}

/* ----------------------------------------------------------------- catalog */

export interface ChoiceValue {
  value: string
  label: string
  description?: string
}

export interface Condition {
  var: string
  equals?: string
  notEquals?: string
  notEmpty?: boolean
  empty?: boolean
}

export interface WorkflowStep {
  command?: string
  instruction?: string
  note?: string
  when?: Condition
  unless?: Condition
}

export interface WorkflowVariable {
  name: string
  prompt: string
  type: VariableType
  required: boolean
  default: string
  help?: string
  placeholder?: string
  choices: ChoiceValue[]
  pattern?: string
  sensitive?: boolean
  min?: number
  max?: number
}

export interface WorkflowReference {
  title: string
  url: string
}

export interface Workflow {
  id: string
  title: string
  category: string
  summary: string
  keywords: string[]
  tags: string[]
  severity: Severity
  effect: WorkflowEffect
  requires: string[]
  notes: string[]
  variables: WorkflowVariable[]
  steps: WorkflowStep[]
  verify: WorkflowStep[]
  cleanup: WorkflowStep[]
  references: WorkflowReference[]
}

export interface Category {
  id: string
  name: string
  description?: string
}

export interface RenderedStep {
  index: number
  command?: string
  instruction?: string
  note?: string
  section: 'primary' | 'verify' | 'cleanup'
}

export interface Runbook {
  workflowId: string
  workflowTitle: string
  values: Record<string, string>
  primary: RenderedStep[]
  verify: RenderedStep[]
  cleanup: RenderedStep[]
}

export interface DeviceType {
  id: string
  name: string
  vendor: string
  family: string
  description: string
  aliases: string[]
  notes: string[]
  categories: Category[]
  workflows: Workflow[]
  source: DeviceSource
  extends?: string
}

export interface CatalogIssue {
  severity: 'error' | 'warning'
  message: string
  source?: string
  typeId?: string
  workflowId?: string
}

export interface CatalogBundle {
  types: DeviceType[]
  issues: CatalogIssue[]
  loadedAt: string
}

export interface CatalogSaveResult {
  ok: boolean
  bundle?: CatalogBundle
  errors?: string[]
  path?: string
}

/* ------------------------------------------------------------------ themes */

export interface TerminalTheme {
  id: string
  name: string
  dark: boolean
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export type AppThemeId = 'midnight' | 'graphite' | 'daylight'

/* ---------------------------------------------------------------- settings */

export interface AppSettings {
  schemaVersion: number
  appTheme: AppThemeId
  terminalThemeId: string
  customTerminalTheme?: TerminalTheme
  fontFamily: string
  fontSize: number
  fontWeight: string
  lineHeight: number
  letterSpacing: number
  fontLigatures: boolean
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  scrollback: number
  bellStyle: 'none' | 'sound'
  copyOnSelect: boolean
  rightClickPaste: boolean
  confirmMultilinePaste: boolean
  inlineSuggestions: boolean
  ghostOpacity: number
  suggestionAcceptKey: 'tab' | 'right'
  uiFontFamily: string
  uiScale: number
  density: 'comfortable' | 'compact'
  showSidebar: boolean
  showTroubleshootPanel: boolean
  sidebarSize: number
  troubleshootSize: number
  logSessions: boolean
  strictHostKeyChecking: boolean
  clickableLinks: boolean
  localShell: string
  localShellArgs: string[]
  keepaliveSeconds: number
  sftpShowHidden: boolean
  reduceMotion: boolean
  autoCheckUpdates: boolean
  skippedUpdateVersion?: string
  aiEnabled: boolean
  aiActiveProfileId?: string
  aiProfiles: AiProfile[]
  aiIncludeContext: boolean
}

export type AiProviderKind = 'openai-compatible' | 'anthropic'
export type AiAuthStyle = 'bearer' | 'x-api-key' | 'api-key' | 'none'

export interface AiProfile {
  id: string
  name: string
  kind: AiProviderKind
  baseUrl: string
  model: string
  authStyle: AiAuthStyle
  maxTokens: number
  temperature: number
  local: boolean
}

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiChatContext {
  deviceTypeName?: string
  vendor?: string
  family?: string
  hostLabel?: string
  deviceNotes?: string[]
  terminalTail?: string
  currentCommand?: string
  runbookHints?: string[]
}

export interface AiChatRequest {
  requestId: string
  profileId: string
  messages: AiChatMessage[]
  context: AiChatContext
  includeContext: boolean
}

export type AiChatResult =
  | { ok: true; text: string }
  | { ok: false; error: string; cancelled?: boolean }

export interface AiModelsRequest {
  profile: AiProfile
  apiKey?: string
}

export type AiModelsResult =
  | { ok: true; models: string[] }
  | { ok: false; error: string }

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  name: string
  notes: string
  url: string
  publishedAt?: string
}

export interface UpdateCheckResult {
  checked: boolean
  available: boolean
  update?: UpdateInfo
  reason?: string
  lastCheckedAt?: string
}

export interface AppPaths {
  appData: string
  catalog: string
  customCatalog: string
  logs: string
  exports: string
}

/* ------------------------------------------------------------------ debug */

export interface DebugSession {
  id: string
  terminalId?: string
  hostId?: string
  hostLabel: string
  hostname?: string
  deviceTypeId?: string
  deviceTypeName?: string
  workflowId: string
  workflowTitle: string
  effect: WorkflowEffect
  cleanup: string[]
  startedAt: string
  mode: 'sent' | 'copied'
  live: boolean
}

export interface RegisterDebugInput {
  terminalId?: string
  hostId?: string
  hostLabel: string
  hostname?: string
  deviceTypeId?: string
  deviceTypeName?: string
  workflowId: string
  workflowTitle: string
  effect: WorkflowEffect
  cleanup: string[]
  mode: 'sent' | 'copied'
}

export interface DebugStopResult {
  sessions: DebugSession[]
  cleared: number
  stoppedLive: number
  copied: boolean
  cleanupFile?: string
}

/* -------------------------------------------------------------------- sftp */

export interface SftpEntry {
  name: string
  path: string
  type: 'file' | 'directory' | 'symlink' | 'other'
  size: number
  modified?: number
  mode?: number
}

export interface SftpListResult {
  path: string
  entries: SftpEntry[]
}

export interface SftpActionResult {
  ok: boolean
  message?: string
  path?: string
}

/* --------------------------------------------------------------- forwarding */

export interface PortForward {
  id: string
  terminalId: string
  localPort: number
  remoteHost: string
  remotePort: number
  status: 'starting' | 'active' | 'error' | 'stopped'
  error?: string
  startedAt: string
}

/* ---------------------------------------------------------------- snippets */

export interface Snippet {
  id: string
  title: string
  command: string
  description?: string
  tags: string[]
  deviceTypeId?: string
  createdAt: string
  updatedAt: string
}

export interface SnippetInput {
  id?: string
  title: string
  command: string
  description?: string
  tags?: string[]
  deviceTypeId?: string
}

/* -------------------------------------------------------------- known hosts */

export interface KnownHost {
  id: string
  hostname: string
  port: number
  fingerprint: string
  keyType?: string
  addedAt: string
}

export interface TrustHostInput {
  hostname: string
  port: number
  fingerprint: string
  keyType?: string
}

/* ---------------------------------------------------------------- bootstrap */

export interface Bootstrap {
  appVersion: string
  platform: PlatformName
  paths: AppPaths
  settings: AppSettings
  hosts: Host[]
  snippets: Snippet[]
  knownHosts: KnownHost[]
  catalog: CatalogBundle
  debugSessions: DebugSession[]
  aiKeyIds: string[]
  warnings?: string[]
}

export interface ChooseFileOptions {
  title?: string
  filters?: Array<{ name: string; extensions: string[] }>
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>
}

export interface ChooseSaveOptions {
  title?: string
  defaultPath?: string
  filters?: Array<{ name: string; extensions: string[] }>
}

/* --------------------------------------------------------------------- api */

export type Unsubscribe = () => void

export interface TstermApi {
  bootstrap(): Promise<Bootstrap>
  app: {
    quit(action: QuitAction): Promise<void>
    onQuitRequest(callback: (sessions: DebugSession[]) => void): Unsubscribe
    onMenuCommand(callback: (command: MenuCommand) => void): Unsubscribe
    openExternal(url: string): Promise<void>
    revealPath(path: string): Promise<void>
    chooseFile(options?: ChooseFileOptions): Promise<string | null>
    chooseSavePath(options?: ChooseSaveOptions): Promise<string | null>
    copyText(text: string): Promise<void>
    readClipboard(): Promise<string>
  }
  hosts: {
    save(input: HostInput): Promise<HostSaveResult>
    delete(hostId: string): Promise<Host[]>
    setDeviceType(hostId: string, deviceType: string): Promise<Host[]>
    importHosts(): Promise<{ hosts: Host[]; imported: number; errors: string[] }>
    exportHosts(): Promise<{ path: string; count: number } | null>
  }
  terminals: {
    ssh(options: ConnectSshOptions): Promise<CreateResult>
    local(options: ConnectLocalOptions): Promise<CreateResult>
    write(terminalId: string, data: string): void
    resize(terminalId: string, cols: number, rows: number): void
    close(terminalId: string): Promise<void>
    onData(callback: (event: TerminalDataEvent) => void): Unsubscribe
    onStatus(callback: (event: SessionStatusEvent) => void): Unsubscribe
  }
  catalog: {
    get(): Promise<CatalogBundle>
    reload(): Promise<CatalogBundle>
    saveCustom(json: string): Promise<CatalogSaveResult>
    deleteCustom(id: string): Promise<CatalogBundle>
    importCustom(): Promise<CatalogSaveResult | null>
    openFolder(): Promise<void>
    template(): Promise<string>
  }
  settings: {
    update(patch: Partial<AppSettings>): Promise<AppSettings>
    reset(): Promise<AppSettings>
    onChanged(callback: (settings: AppSettings) => void): Unsubscribe
  }
  debug: {
    register(input: RegisterDebugInput): Promise<DebugSession[]>
    clear(ids: string[]): Promise<DebugSession[]>
    stop(ids: string[]): Promise<DebugStopResult>
    list(): Promise<DebugSession[]>
    onChanged(callback: (sessions: DebugSession[]) => void): Unsubscribe
  }
  knownHosts: {
    trust(input: TrustHostInput): Promise<KnownHost[]>
    remove(id: string): Promise<KnownHost[]>
  }
  sftp: {
    list(terminalId: string, path: string): Promise<SftpListResult>
    upload(terminalId: string, remoteDir: string): Promise<SftpActionResult>
    download(terminalId: string, remotePath: string): Promise<SftpActionResult>
    mkdir(terminalId: string, path: string): Promise<void>
    rename(terminalId: string, from: string, to: string): Promise<void>
    remove(terminalId: string, path: string, isDirectory: boolean): Promise<void>
  }
  forwards: {
    list(terminalId: string): Promise<PortForward[]>
    start(terminalId: string, remoteHost: string, remotePort: number, localPort?: number): Promise<PortForward>
    stop(id: string): Promise<void>
    onChanged(callback: (forward: PortForward) => void): Unsubscribe
  }
  snippets: {
    save(input: SnippetInput): Promise<Snippet[]>
    delete(id: string): Promise<Snippet[]>
  }
  updates: {
    check(force?: boolean): Promise<UpdateCheckResult>
  }
  ai: {
    chat(request: AiChatRequest): Promise<AiChatResult>
    listModels(request: AiModelsRequest): Promise<AiModelsResult>
    saveKey(profileId: string, key: string): Promise<string[]>
    deleteKey(profileId: string): Promise<string[]>
    keyIds(): Promise<string[]>
    cancel(requestId: string): Promise<void>
  }
}
