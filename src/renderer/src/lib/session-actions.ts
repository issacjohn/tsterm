import type {
  ConnectError,
  CreateResult,
  DeviceType,
  Host,
  HostInput,
  Snippet,
  Workflow
} from '@shared/types'
import { buildRunbook, runbookCleanupCommands, runbookCommands } from '@shared/catalog-utils'
import {
  activePane,
  activeTab,
  newPane,
  newTab,
  useAppStore,
  type PaneState,
  type PendingConnect,
  type TabState
} from '../store'
import { terminalDataBus } from './terminal-bus'

const promptedDeviceTypes = new Set<string>()
const credentialCache = new Map<string, { password?: string; passphrase?: string }>()

function store() {
  return useAppStore.getState()
}

function hostById(id: string | undefined): Host | undefined {
  return id ? store().hosts.find((host) => host.id === id) : undefined
}

function paneExists(tabId: string, paneId: string): boolean {
  const tab = store().tabs.find((item) => item.id === tabId)
  return Boolean(tab?.panes.some((pane) => pane.id === paneId))
}

function setPaneError(pending: PendingConnect, message: string): void {
  if (!paneExists(pending.tabId, pending.paneId)) return
  store().updatePane(pending.tabId, pending.paneId, {
    status: 'error',
    error: message,
    sessionId: undefined,
    session: undefined
  })
}

function hostInput(host: Host, extra: Partial<HostInput> = {}): HostInput {
  return {
    id: host.id,
    label: host.label,
    hostname: host.hostname,
    port: host.port,
    username: host.username,
    authType: host.authType,
    privateKeyPath: host.privateKeyPath,
    group: host.group,
    tags: host.tags,
    deviceType: host.deviceType,
    color: host.color,
    jumpHostId: host.jumpHostId,
    startupCommand: host.startupCommand,
    keepaliveSeconds: host.keepaliveSeconds,
    notes: host.notes,
    favorite: host.favorite,
    savePassword: false,
    ...extra
  }
}

export function openHostEditor(hostId?: string): void {
  store().setModal({ kind: 'host', hostId })
}

export function cacheHostCredentials(hostId: string, credentials: { password?: string; passphrase?: string }): void {
  credentialCache.set(hostId, credentials)
}

export function openDeviceTypePickerForPane(tabId: string, paneId: string, current?: string): void {
  const pane = store().getPane(tabId, paneId)
  store().setModal({
    kind: 'device-type',
    hostId: pane?.hostId,
    tabId,
    paneId,
    current,
    title: pane?.title
  })
}

function openDeviceTypePickerIfNeeded(host: Host, tabId: string, paneId: string): void {
  if (host.deviceType) return
  if (promptedDeviceTypes.has(host.id)) return
  promptedDeviceTypes.add(host.id)
  store().setModal({
    kind: 'device-type',
    hostId: host.id,
    tabId,
    paneId,
    title: host.label
  })
}

async function beginSshConnect(pending: PendingConnect): Promise<void> {
  const host = hostById(pending.hostId)
  if (!host) {
    setPaneError(pending, 'Host not found.')
    return
  }
  const cached = credentialCache.get(host.id)
  const password = pending.password ?? cached?.password
  const passphrase = pending.passphrase ?? cached?.passphrase
  if (host.authType === 'password' && !password && !host.hasStoredPassword) {
    store().setModal({ kind: 'password', pending })
    return
  }
  if (host.authType === 'key' && !host.privateKeyPath) {
    store().setModal({ kind: 'host', hostId: host.id })
    store().notify({
      kind: 'warning',
      title: 'Private key required',
      message: 'Choose a private key file for this host before connecting.'
    })
    return
  }

  const pane = store().getPane(pending.tabId, pending.paneId)
  const cols = pane?.cols ?? 100
  const rows = pane?.rows ?? 30
  store().updatePane(pending.tabId, pending.paneId, {
    status: 'pending',
    error: undefined,
    sessionId: undefined,
    session: undefined
  })

  let result: CreateResult
  try {
    result = await window.tsterm.terminals.ssh({
      hostId: host.id,
      cols,
      rows,
      password,
      passphrase,
      trustFingerprint: pending.trustFingerprint
    })
  } catch (error) {
    setPaneError(pending, (error as Error).message)
    return
  }

  if (!result.ok) {
    const connectError = result.error
    if (connectError.code === 'UNKNOWN_HOST_KEY' || connectError.code === 'HOST_KEY_MISMATCH') {
      store().setModal({ kind: 'hostkey', pending, error: connectError })
      return
    }
    if (connectError.code === 'AUTH' && host.authType === 'password') {
      store().setModal({ kind: 'password', pending: { ...pending, password: undefined }, error: connectError.message })
      return
    }
    setPaneError(pending, connectError.message)
    store().notify({
      kind: 'error',
      title: `Could not connect to ${host.label}`,
      message: connectError.message,
      duration: 9000
    })
    return
  }

  const session = result.session
  if (!paneExists(pending.tabId, pending.paneId)) {
    void window.tsterm.terminals.close(session.id)
    return
  }
  store().updatePane(pending.tabId, pending.paneId, {
    sessionId: session.id,
    session,
    status: session.status,
    title: session.title,
    subtitle: session.subtitle,
    deviceTypeId: host.deviceType || session.deviceType,
    error: undefined
  })
  store().updateTab(pending.tabId, { title: session.title })
  store().notify({
    kind: 'success',
    title: `Connected to ${host.label}`,
    message: `${host.username}@${host.hostname}:${host.port}`,
    duration: 3000
  })
  openDeviceTypePickerIfNeeded(host, pending.tabId, pending.paneId)
}

function createSshTab(host: Host): { tab: TabState; pane: PaneState } {
  const pane = newPane({
    kind: 'ssh',
    hostId: host.id,
    title: host.label,
    subtitle: `${host.username}@${host.hostname}:${host.port}`,
    deviceTypeId: host.deviceType
  })
  const tab = newTab(pane)
  store().addTab(tab)
  return { tab, pane }
}

export function connectHost(hostId: string): void {
  const host = hostById(hostId)
  if (!host) {
    store().notify({ kind: 'error', title: 'Host not found' })
    return
  }
  const { tab, pane } = createSshTab(host)
  void beginSshConnect({ hostId: host.id, tabId: tab.id, paneId: pane.id })
}

export function connectHostInPane(hostId: string, tabId: string, paneId: string): void {
  const host = hostById(hostId)
  if (!host) return
  store().updatePane(tabId, paneId, {
    hostId: host.id,
    kind: 'ssh',
    title: host.label,
    subtitle: `${host.username}@${host.hostname}:${host.port}`,
    deviceTypeId: host.deviceType,
    status: 'pending',
    error: undefined,
    sessionId: undefined,
    session: undefined
  })
  void beginSshConnect({ hostId: host.id, tabId, paneId })
}

function localDeviceType(platform: string): string {
  if (platform === 'win32') return 'windows'
  if (platform === 'darwin') return 'macos'
  return 'linux'
}

async function beginLocalConnect(tabId: string, paneId: string): Promise<void> {
  const state = store()
  const pane = state.getPane(tabId, paneId)
  state.updatePane(tabId, paneId, { status: 'pending', error: undefined })
  let result: CreateResult
  try {
    result = await window.tsterm.terminals.local({
      cols: pane?.cols ?? 100,
      rows: pane?.rows ?? 30
    })
  } catch (error) {
    state.updatePane(tabId, paneId, { status: 'error', error: (error as Error).message })
    return
  }
  if (!result.ok) {
    state.updatePane(tabId, paneId, { status: 'error', error: result.error.message })
    if (result.error.code === 'PTY_UNAVAILABLE') {
      state.notify({
        kind: 'error',
        title: 'Local shell unavailable',
        message: result.error.message,
        duration: 10000
      })
    }
    return
  }
  if (!paneExists(tabId, paneId)) {
    void window.tsterm.terminals.close(result.session.id)
    return
  }
  state.updatePane(tabId, paneId, {
    sessionId: result.session.id,
    session: result.session,
    status: 'connected',
    title: result.session.title,
    subtitle: result.session.subtitle,
    deviceTypeId: localDeviceType(state.appPlatform),
    error: undefined
  })
  state.updateTab(tabId, { title: result.session.title })
}

export function openLocalTerminal(): void {
  const pane = newPane({
    kind: 'local',
    title: 'Local shell',
    deviceTypeId: localDeviceType(store().appPlatform)
  })
  const tab = newTab(pane)
  store().addTab(tab)
  void beginLocalConnect(tab.id, pane.id)
}

export function reconnectPane(tabId: string, paneId: string): void {
  const pane = store().getPane(tabId, paneId)
  if (!pane) return
  if (pane.sessionId) {
    terminalDataBus.release(pane.sessionId)
    void window.tsterm.terminals.close(pane.sessionId)
  }
  if (pane.kind === 'local') {
    void beginLocalConnect(tabId, paneId)
    return
  }
  if (!pane.hostId) return
  store().updatePane(tabId, paneId, {
    sessionId: undefined,
    session: undefined,
    status: 'pending',
    error: undefined
  })
  void beginSshConnect({ hostId: pane.hostId, tabId, paneId })
}

export function reconnectActivePane(): void {
  const state = store()
  const tab = activeTab(state)
  if (!tab) return
  reconnectPane(tab.id, tab.activePaneId)
}

export function splitActivePane(direction: 'horizontal' | 'vertical'): void {
  const state = store()
  const tab = activeTab(state)
  const pane = activePane(state)
  if (!tab || !pane) return
  if (tab.panes.length >= 2) {
    state.notify({
      kind: 'info',
      title: 'Split limit reached',
      message: 'This build supports two panes per tab. Open a new tab for another session.'
    })
    return
  }
  const clone = newPane({
    kind: pane.kind,
    hostId: pane.hostId,
    title: pane.title,
    subtitle: pane.subtitle,
    deviceTypeId: pane.deviceTypeId
  })
  state.addPane(tab.id, clone)
  state.setTabLayout(tab.id, direction)
  if (clone.kind === 'local') {
    void beginLocalConnect(tab.id, clone.id)
  } else if (clone.hostId) {
    void beginSshConnect({ hostId: clone.hostId, tabId: tab.id, paneId: clone.id })
  }
}

export function closeTab(tabId: string): void {
  const state = store()
  const tab = state.tabs.find((item) => item.id === tabId)
  if (!tab) return
  for (const pane of tab.panes) {
    if (pane.sessionId) {
      terminalDataBus.release(pane.sessionId)
      void window.tsterm.terminals.close(pane.sessionId)
    }
  }
  state.removeTab(tabId)
}

export function closeActiveTab(): void {
  if (store().activeTabId) closeTab(store().activeTabId as string)
}

export async function submitPassword(
  pending: PendingConnect,
  password: string,
  remember: boolean
): Promise<void> {
  const host = hostById(pending.hostId)
  if (!host) return
  store().setModal(null)
  if (remember) {
    try {
      const result = await window.tsterm.hosts.save(
        hostInput(host, {
          password,
          savePassword: true
        })
      )
      store().setHosts(result.hosts)
      if (result.warning) {
        store().notify({ kind: 'warning', title: 'Password not stored', message: result.warning, duration: 8000 })
      }
    } catch (error) {
      store().notify({ kind: 'error', title: 'Could not save password', message: (error as Error).message })
    }
  }
  await beginSshConnect({ ...pending, password, trustFingerprint: pending.trustFingerprint })
}

export async function trustHostKey(pending: PendingConnect, error: ConnectError): Promise<void> {
  if (!error.fingerprint) return
  try {
    const knownHosts = await window.tsterm.knownHosts.trust({
      hostname: error.hostname || '',
      port: error.port || 22,
      fingerprint: error.fingerprint,
      keyType: error.keyType
    })
    store().setKnownHosts(knownHosts)
    store().setModal(null)
    await beginSshConnect({ ...pending, trustFingerprint: error.fingerprint })
  } catch (trustError) {
    store().notify({ kind: 'error', title: 'Could not trust host key', message: (trustError as Error).message })
  }
}

export function cancelPendingConnect(pending: PendingConnect): void {
  store().setModal(null)
  if (paneExists(pending.tabId, pending.paneId)) {
    store().updatePane(pending.tabId, pending.paneId, {
      status: 'idle',
      error: 'Connection cancelled.'
    })
  }
}

export async function setDeviceTypeForHost(
  hostId: string,
  deviceTypeId: string,
  tabId?: string,
  paneId?: string
): Promise<void> {
  try {
    const hosts = await window.tsterm.hosts.setDeviceType(hostId, deviceTypeId)
    store().setHosts(hosts)
    store().updatePanesForHost(hostId, { deviceTypeId })
    if (tabId && paneId) {
      store().updatePane(tabId, paneId, { deviceTypeId })
    }
    promptedDeviceTypes.delete(hostId)
    store().setModal(null)
    const type = store().catalog.types.find((item) => item.id === deviceTypeId)
    store().notify({
      kind: 'success',
      title: 'Device type saved',
      message: `${hostById(hostId)?.label ?? 'Host'} is now treated as ${type?.name ?? deviceTypeId}.`,
      duration: 3500
    })
  } catch (error) {
    store().notify({ kind: 'error', title: 'Could not save device type', message: (error as Error).message })
  }
}

export function deviceTypeForSession(sessionId: string | undefined): DeviceType | undefined {
  if (!sessionId) return undefined
  const state = store()
  for (const tab of state.tabs) {
    for (const pane of tab.panes) {
      if (pane.sessionId === sessionId) {
        return state.catalog.types.find((type) => type.id === pane.deviceTypeId)
      }
    }
  }
  return undefined
}

export async function writeCommandsSequential(sessionId: string, commands: string[], delay = 70): Promise<void> {
  for (let index = 0; index < commands.length; index += 1) {
    window.tsterm.terminals.write(sessionId, `${commands[index]}\n`)
    if (index < commands.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

export interface SendWorkflowContext {
  hostLabel: string
  hostname?: string
  hostId?: string
  deviceType: DeviceType
  workflow: Workflow
  values: Record<string, string>
  sessionId?: string
  mode: 'send' | 'copy'
}

export function workflowRunbook(context: SendWorkflowContext) {
  return buildRunbook(context.workflow, context.values)
}

export async function sendWorkflow(context: SendWorkflowContext): Promise<boolean> {
  const { workflow, deviceType, values, sessionId } = context
  if (!sessionId) {
    store().notify({
      kind: 'warning',
      title: 'No active terminal',
      message: 'Open an SSH or local session before sending commands.'
    })
    return false
  }
  const runbook = buildRunbook(workflow, values)
  const commands = runbookCommands(runbook)
  if (!commands.length) {
    store().notify({ kind: 'warning', title: 'Nothing to send', message: 'This workflow has no executable commands.' })
    return false
  }
  await writeCommandsSequential(sessionId, commands)
  if ((workflow.effect === 'debug' || workflow.effect === 'capture') && workflow.cleanup.length) {
    const sessions = await window.tsterm.debug.register({
      terminalId: sessionId,
      hostId: context.hostId,
      hostLabel: context.hostLabel,
      hostname: context.hostname,
      deviceTypeId: deviceType.id,
      deviceTypeName: deviceType.name,
      workflowId: workflow.id,
      workflowTitle: workflow.title,
      effect: workflow.effect,
      cleanup: runbookCleanupCommands(runbook),
      mode: 'sent'
    })
    store().setDebugSessions(sessions)
  }
  store().notify({
    kind: 'success',
    title: 'Commands sent',
    message:
      workflow.effect === 'debug' || workflow.effect === 'capture'
        ? `${workflow.title} is now tracked. TSTerm will remind you to stop it on exit.`
        : workflow.title,
    duration: 4500
  })
  return true
}

export async function trackCopiedWorkflow(context: SendWorkflowContext): Promise<void> {
  const { workflow, deviceType, values, sessionId } = context
  if ((workflow.effect !== 'debug' && workflow.effect !== 'capture') || !workflow.cleanup.length) return
  const cleanup = runbookCleanupCommands(buildRunbook(workflow, values))
  const sessions = await window.tsterm.debug.register({
    terminalId: sessionId,
    hostId: context.hostId,
    hostLabel: context.hostLabel,
    hostname: context.hostname,
    deviceTypeId: deviceType.id,
    deviceTypeName: deviceType.name,
    workflowId: workflow.id,
    workflowTitle: workflow.title,
    effect: workflow.effect,
    cleanup,
    mode: 'copied'
  })
  store().setDebugSessions(sessions)
}

export function snippetToCommand(snippet: Snippet): string {
  return snippet.command
}

export function saveSettings(patch: Parameters<typeof window.tsterm.settings.update>[0]): void {
  const state = store()
  state.setSettings({ ...state.settings, ...patch })
  void window.tsterm.settings.update(patch).then((settings) => store().setSettings(settings))
}
