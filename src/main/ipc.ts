import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow, app, clipboard, dialog, ipcMain, shell } from 'electron'
import type {
  AppSettings,
  Bootstrap,
  ChooseFileOptions,
  ChooseSaveOptions,
  CommandRouteRequest,
  CommandSearchRequest,
  CommandVerifyRequest,
  ConnectLocalOptions,
  ConnectSshOptions,
  HostInput,
  MenuCommand,
  QuitAction,
  RegisterDebugInput,
  SnippetInput,
  TrustHostInput
} from '@shared/types'
import type { Store } from './store'
import type { CatalogService } from './catalog'
import type { SessionManager } from './sessions'
import type { DebugManager } from './debug'
import type { SftpService } from './sftp'
import type { ForwardManager } from './forwarding'
import type { QuitCoordinator } from './quit'
import type { UpdateService } from './updates'
import type { AiService } from './ai'
import type { ReferenceService } from './references'
import type { CommandService } from './commands'
import { installOllamaRuntime } from './ollama-runtime'

export interface IpcServices {
  store: Store
  catalog: CatalogService
  sessions: SessionManager
  debug: DebugManager
  sftp: SftpService
  forwards: ForwardManager
  quit: QuitCoordinator
  updates: UpdateService
  ai: AiService
  references: ReferenceService
  commands: CommandService
  getWindow: () => BrowserWindow | null
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`)
  return value
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function asPort(value: unknown, fallback: number): number {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 && number <= 65535 ? number : fallback
}

export function registerIpc(services: IpcServices): void {
  const { store, catalog, sessions, debug, sftp, forwards, quit, updates, ai, references, commands } =
    services

  const openDialog = (
    options: Electron.OpenDialogOptions
  ): Promise<Electron.OpenDialogReturnValue> => {
    const window = services.getWindow()
    return window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options)
  }

  const saveDialog = (
    options: Electron.SaveDialogOptions
  ): Promise<Electron.SaveDialogReturnValue> => {
    const window = services.getWindow()
    return window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options)
  }

  ipcMain.handle('bootstrap', (): Bootstrap => {
    return {
      appVersion: app.getVersion(),
      platform: process.platform,
      paths: store.paths,
      settings: store.getSettings(),
      hosts: store.getHosts(),
      snippets: store.getSnippets(),
      knownHosts: store.getKnownHosts(),
      catalog: catalog.get(),
      debugSessions: debug.list(),
      aiKeyIds: store.getAiKeyIds(),
      referenceDocs: references.list(),
      warnings: [...store.warnings, ...references.getWarnings(), ...commands.getWarnings()]
    }
  })

  ipcMain.handle('hosts:save', (_event, input: HostInput) => {
    const result = store.saveHost(input)
    broadcast('hosts:changed', result.hosts)
    return result
  })

  ipcMain.handle('hosts:delete', (_event, hostId: string) => {
    const hosts = store.deleteHost(requiredString(hostId, 'Host id'))
    broadcast('hosts:changed', hosts)
    return hosts
  })

  ipcMain.handle('hosts:set-device-type', (_event, hostId: string, deviceType: string) => {
    const hosts = store.setHostDeviceType(requiredString(hostId, 'Host id'), String(deviceType))
    broadcast('hosts:changed', hosts)
    return hosts
  })

  ipcMain.handle('hosts:import', async () => {
    const result = await openDialog({
      title: 'Import hosts',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePaths[0]) {
      return { hosts: store.getHosts(), imported: 0, errors: [] }
    }
    try {
      const raw = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8').replace(/^\uFEFF/, ''))
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.hosts) ? raw.hosts : null
      if (!list) throw new Error('Expected an array of hosts or an object with a "hosts" array.')
      const inputs: HostInput[] = list.map((item: Record<string, unknown>) => ({
        label: String(item.label ?? item.hostname ?? ''),
        hostname: String(item.hostname ?? ''),
        port: asPort(item.port, 22),
        username: String(item.username ?? ''),
        authType: item.authType === 'key' || item.authType === 'agent' ? item.authType : 'password',
        privateKeyPath: optionalString(item.privateKeyPath),
        group: optionalString(item.group),
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        deviceType: optionalString(item.deviceType),
        color: optionalString(item.color),
        startupCommand: optionalString(item.startupCommand),
        notes: optionalString(item.notes),
        favorite: Boolean(item.favorite),
        savePassword: false
      }))
      const merged = store.mergeImportedHosts(inputs)
      broadcast('hosts:changed', merged.hosts)
      return merged
    } catch (error) {
      return { hosts: store.getHosts(), imported: 0, errors: [(error as Error).message] }
    }
  })

  ipcMain.handle('hosts:export', async () => {
    const result = await saveDialog({
      title: 'Export hosts',
      defaultPath: 'tsterm-hosts.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return null
    const hosts = store.exportableHosts()
    fs.writeFileSync(
      result.filePath,
      JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), hosts }, null, 2),
      'utf8'
    )
    return { path: result.filePath, count: hosts.length }
  })

  ipcMain.handle('terminal:ssh', async (_event, options: ConnectSshOptions) => {
    const result = await sessions.connectSsh({
      hostId: requiredString(options?.hostId, 'Host id'),
      cols: Math.max(20, Number(options?.cols) || 80),
      rows: Math.max(5, Number(options?.rows) || 24),
      password: optionalString(options?.password),
      passphrase: optionalString(options?.passphrase),
      trustFingerprint: optionalString(options?.trustFingerprint)
    })
    return result
  })

  ipcMain.handle('terminal:local', (_event, options: ConnectLocalOptions) => {
    return sessions.connectLocal({
      cols: Math.max(20, Number(options?.cols) || 80),
      rows: Math.max(5, Number(options?.rows) || 24),
      shell: optionalString(options?.shell),
      cwd: optionalString(options?.cwd),
      title: optionalString(options?.title)
    })
  })

  ipcMain.on('terminal:write', (_event, terminalId: string, data: string) => {
    if (typeof terminalId === 'string' && typeof data === 'string') sessions.write(terminalId, data)
  })

  ipcMain.on('terminal:resize', (_event, terminalId: string, cols: number, rows: number) => {
    if (typeof terminalId === 'string') sessions.resize(terminalId, Number(cols) || 80, Number(rows) || 24)
  })

  ipcMain.handle('terminal:close', (_event, terminalId: string) => {
    sessions.close(requiredString(terminalId, 'Terminal id'))
  })

  ipcMain.handle('catalog:get', () => catalog.get())

  ipcMain.handle('catalog:reload', () => {
    const bundle = catalog.load()
    broadcast('catalog:changed', bundle)
    return bundle
  })

  ipcMain.handle('catalog:save-custom', (_event, json: string) => {
    const result = catalog.saveCustom(requiredString(json, 'Catalog JSON'))
    if (result.ok) broadcast('catalog:changed', result.bundle)
    return result
  })

  ipcMain.handle('catalog:delete-custom', (_event, id: string) => {
    const bundle = catalog.deleteCustom(requiredString(id, 'Device type id'))
    broadcast('catalog:changed', bundle)
    return bundle
  })

  ipcMain.handle('catalog:import-custom', async () => {
    const result = await openDialog({
      title: 'Import device pack',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const imported = catalog.importCustom(result.filePaths[0])
    if (imported.ok) broadcast('catalog:changed', imported.bundle)
    return imported
  })

  ipcMain.handle('catalog:open-folder', async () => {
    await shell.openPath(store.paths.customCatalog)
  })

  ipcMain.handle('catalog:template', () => catalog.template())

  ipcMain.handle('settings:update', (_event, patch: Partial<AppSettings>) => {
    const settings = store.updateSettings(patch)
    broadcast('settings:changed', settings)
    return settings
  })

  ipcMain.handle('settings:reset', () => {
    const settings = store.resetSettings()
    broadcast('settings:changed', settings)
    return settings
  })

  ipcMain.handle('debug:register', (_event, input: RegisterDebugInput) => {
    return debug.register(input)
  })

  ipcMain.handle('debug:clear', (_event, ids: string[]) => debug.clear(Array.isArray(ids) ? ids : []))

  ipcMain.handle('debug:stop', (_event, ids: string[]) => debug.stop(Array.isArray(ids) ? ids : []))

  ipcMain.handle('debug:list', () => debug.list())

  ipcMain.handle('known-hosts:trust', (_event, input: TrustHostInput) => {
    return store.trustHost(input)
  })

  ipcMain.handle('known-hosts:remove', (_event, id: string) => {
    return store.removeKnownHost(requiredString(id, 'Known host id'))
  })

  ipcMain.handle('sftp:list', (_event, terminalId: string, remotePath: string) => {
    return sftp.list(requiredString(terminalId, 'Terminal id'), String(remotePath || '.'))
  })

  ipcMain.handle('sftp:upload', (_event, terminalId: string, remoteDir: string) => {
    return sftp.upload(requiredString(terminalId, 'Terminal id'), String(remoteDir || '.'))
  })

  ipcMain.handle('sftp:download', (_event, terminalId: string, remotePath: string) => {
    return sftp.download(requiredString(terminalId, 'Terminal id'), requiredString(remotePath, 'Remote path'))
  })

  ipcMain.handle('sftp:mkdir', (_event, terminalId: string, remotePath: string) => {
    return sftp.mkdir(requiredString(terminalId, 'Terminal id'), requiredString(remotePath, 'Remote path'))
  })

  ipcMain.handle('sftp:rename', (_event, terminalId: string, from: string, to: string) => {
    return sftp.rename(
      requiredString(terminalId, 'Terminal id'),
      requiredString(from, 'Source path'),
      requiredString(to, 'Target path')
    )
  })

  ipcMain.handle('sftp:remove', (_event, terminalId: string, remotePath: string, isDirectory: boolean) => {
    return sftp.remove(
      requiredString(terminalId, 'Terminal id'),
      requiredString(remotePath, 'Remote path'),
      Boolean(isDirectory)
    )
  })

  ipcMain.handle('forwards:list', (_event, terminalId: string) => {
    return forwards.list(requiredString(terminalId, 'Terminal id'))
  })

  ipcMain.handle(
    'forwards:start',
    (_event, terminalId: string, remoteHost: string, remotePort: number, localPort?: number) => {
      return forwards.start(
        requiredString(terminalId, 'Terminal id'),
        requiredString(remoteHost, 'Remote host'),
        Number(remotePort),
        localPort === undefined ? 0 : Number(localPort)
      )
    }
  )

  ipcMain.handle('forwards:stop', (_event, id: string) => {
    forwards.stop(requiredString(id, 'Forward id'))
  })

  ipcMain.handle('snippets:save', (_event, input: SnippetInput) => {
    const snippets = store.saveSnippet(input)
    broadcast('snippets:changed', snippets)
    return snippets
  })

  ipcMain.handle('snippets:delete', (_event, id: string) => {
    const snippets = store.deleteSnippet(requiredString(id, 'Snippet id'))
    broadcast('snippets:changed', snippets)
    return snippets
  })

  ipcMain.handle('updates:check', (_event, force?: boolean) => {
    return updates.check(Boolean(force))
  })

  ipcMain.handle('ai:chat', (event, request) =>
    ai.chat(request, (text) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('ai:chat-stream', {
          requestId: request?.requestId,
          type: 'delta',
          text
        })
      }
    })
  )
  ipcMain.handle('ai:list-models', (_event, request) => ai.listModels(request))
  ipcMain.handle('ai:local-status', (_event, request) => ai.localStatus(request))
  ipcMain.handle('ai:pull-model', (event, request) =>
    ai.pullModel(request, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send('ai:pull-progress', progress)
    })
  )
  ipcMain.handle('ai:install-runtime', () => installOllamaRuntime())
  ipcMain.handle('ai:save-key', (_event, profileId: string, key: string) => {
    store.saveAiKey(requiredString(profileId, 'AI profile id'), requiredString(key, 'API key'))
    return store.getAiKeyIds()
  })
  ipcMain.handle('ai:delete-key', (_event, profileId: string) => {
    store.deleteAiKey(requiredString(profileId, 'AI profile id'))
    return store.getAiKeyIds()
  })
  ipcMain.handle('ai:key-ids', () => store.getAiKeyIds())
  ipcMain.handle('ai:cancel', (_event, requestId: string) => {
    if (requestId) ai.cancel(requestId)
  })

  ipcMain.handle('references:list', () => references.list())
  ipcMain.handle('references:import', async (_event, deviceTypeId?: string) => {
    const result = await openDialog({
      title: 'Add AI reference document',
      properties: ['openFile'],
      filters: [
        {
          name: 'Reference documents',
          extensions: ['pdf', 'html', 'htm', 'md', 'markdown', 'txt', 'json', 'csv', 'log']
        },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, canceled: true, docs: references.list() }
    }
    const imported = await references.import(
      result.filePaths[0],
      typeof deviceTypeId === 'string' ? deviceTypeId : undefined
    )
    return {
      ok: !imported.error,
      docs: imported.docs,
      error: imported.error
    }
  })
  ipcMain.handle('references:remove', (_event, id: string) =>
    references.remove(requiredString(id, 'Reference id'))
  )
  ipcMain.handle('references:search', (_event, request) => references.search(request))
  ipcMain.handle('references:open-folder', () => shell.openPath(references.getFolder()))

  ipcMain.handle('commands:status', () => commands.status())
  ipcMain.handle('commands:reload', () => commands.reload())
  ipcMain.handle('commands:verify', (_event, request?: CommandVerifyRequest) => {
    return commands.verifyCommands({
      commands: Array.isArray(request?.commands) ? request.commands.slice(0, 50) : [],
      strict: request?.strict === true
    })
  })
  ipcMain.handle('commands:search', (_event, request?: CommandSearchRequest) => {
    const input = request && typeof request === 'object' ? request : { query: '' }
    const risk =
      input.risk === 'read_only' ||
      input.risk === 'diagnostic' ||
      input.risk === 'mutating' ||
      input.risk === 'destructive'
        ? input.risk
        : undefined
    return commands.search({
      query: typeof input.query === 'string' ? input.query.slice(0, 1000) : '',
      limit: Number(input.limit) || 8,
      risk,
      mode: typeof input.mode === 'string' ? input.mode.slice(0, 80) : undefined,
      useVector: input.useVector !== false,
      includeReference: input.includeReference !== false
    })
  })
  ipcMain.handle('commands:index-vectors', async (event, profileId?: string) => {
    try {
      return await commands.buildVectorIndex(optionalString(profileId), (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('commands:index-progress', progress)
      })
    } catch (error) {
      return {
        ...commands.status(),
        vectorError: (error as Error).message
      }
    }
  })
  ipcMain.handle('commands:ensure-index', async (event, profileId?: string) => {
    try {
      return await commands.ensureVectorIndex(optionalString(profileId), (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('commands:index-progress', progress)
      })
    } catch (error) {
      return {
        ...commands.status(),
        vectorError: (error as Error).message
      }
    }
  })
  ipcMain.handle('commands:route', (_event, request?: CommandRouteRequest) => {
    const input = request && typeof request === 'object' ? request : ({} as CommandRouteRequest)
    return commands.route({
      query: requiredString(input.query, 'Question'),
      terminalTail:
        typeof input.terminalTail === 'string' ? input.terminalTail.slice(0, 8000) : undefined,
      profileId: optionalString(input.profileId)
    })
  })

  ipcMain.handle('app:quit', (_event, action: QuitAction) => {
    quit.action(action)
  })

  ipcMain.handle('app:choose-file', async (_event, options: ChooseFileOptions = {}) => {
    const result = await openDialog({
      title: options.title,
      properties: options.properties ?? ['openFile'],
      filters: options.filters
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle('app:choose-save-path', async (_event, options: ChooseSaveOptions = {}) => {
    const result = await saveDialog({
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.filters
    })
    return result.canceled ? null : result.filePath ?? null
  })

  ipcMain.handle('app:open-external', async (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) links can be opened.')
    await shell.openExternal(url)
  })

  ipcMain.handle('app:reveal-path', async (_event, target: string) => {
    if (!target) return
    const resolved = path.resolve(target)
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      await shell.openPath(resolved)
    } else {
      shell.showItemInFolder(resolved)
    }
  })

  ipcMain.handle('app:copy-text', (_event, text: string) => {
    clipboard.writeText(String(text ?? ''))
  })

  ipcMain.handle('app:read-clipboard', () => clipboard.readText())
}

export function sendMenuCommand(command: MenuCommand): void {
  broadcast('app:menu-command', command)
}
