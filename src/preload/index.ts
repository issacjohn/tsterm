import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type {
  AppSettings,
  Bootstrap,
  ChooseFileOptions,
  ChooseSaveOptions,
  ConnectLocalOptions,
  ConnectSshOptions,
  DebugSession,
  HostInput,
  MenuCommand,
  PortForward,
  QuitAction,
  RegisterDebugInput,
  SessionStatusEvent,
  SnippetInput,
  TerminalDataEvent,
  TstermApi,
  TrustHostInput,
  Unsubscribe
} from '@shared/types'

function on<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
  const handler = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: TstermApi = {
  bootstrap: () => ipcRenderer.invoke('bootstrap') as Promise<Bootstrap>,
  app: {
    quit: (action: QuitAction) => ipcRenderer.invoke('app:quit', action),
    onQuitRequest: (callback: (sessions: DebugSession[]) => void) => on('app:quit-request', callback),
    onMenuCommand: (callback: (command: MenuCommand) => void) => on('app:menu-command', callback),
    openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
    revealPath: (target: string) => ipcRenderer.invoke('app:reveal-path', target),
    chooseFile: (options?: ChooseFileOptions) => ipcRenderer.invoke('app:choose-file', options),
    chooseSavePath: (options?: ChooseSaveOptions) => ipcRenderer.invoke('app:choose-save-path', options),
    copyText: (text: string) => ipcRenderer.invoke('app:copy-text', text),
    readClipboard: () => ipcRenderer.invoke('app:read-clipboard')
  },
  hosts: {
    save: (input: HostInput) => ipcRenderer.invoke('hosts:save', input),
    delete: (hostId: string) => ipcRenderer.invoke('hosts:delete', hostId),
    setDeviceType: (hostId: string, deviceType: string) =>
      ipcRenderer.invoke('hosts:set-device-type', hostId, deviceType),
    importHosts: () => ipcRenderer.invoke('hosts:import'),
    exportHosts: () => ipcRenderer.invoke('hosts:export')
  },
  terminals: {
    ssh: (options: ConnectSshOptions) => ipcRenderer.invoke('terminal:ssh', options),
    local: (options: ConnectLocalOptions) => ipcRenderer.invoke('terminal:local', options),
    write: (terminalId: string, data: string) => ipcRenderer.send('terminal:write', terminalId, data),
    resize: (terminalId: string, cols: number, rows: number) =>
      ipcRenderer.send('terminal:resize', terminalId, cols, rows),
    close: (terminalId: string) => ipcRenderer.invoke('terminal:close', terminalId),
    onData: (callback: (event: TerminalDataEvent) => void) => on('terminal:data', callback),
    onStatus: (callback: (event: SessionStatusEvent) => void) => on('terminal:status', callback)
  },
  catalog: {
    get: () => ipcRenderer.invoke('catalog:get'),
    reload: () => ipcRenderer.invoke('catalog:reload'),
    saveCustom: (json: string) => ipcRenderer.invoke('catalog:save-custom', json),
    deleteCustom: (id: string) => ipcRenderer.invoke('catalog:delete-custom', id),
    importCustom: () => ipcRenderer.invoke('catalog:import-custom'),
    openFolder: () => ipcRenderer.invoke('catalog:open-folder'),
    template: () => ipcRenderer.invoke('catalog:template')
  },
  settings: {
    update: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', patch),
    reset: () => ipcRenderer.invoke('settings:reset'),
    onChanged: (callback: (settings: AppSettings) => void) => on('settings:changed', callback)
  },
  debug: {
    register: (input: RegisterDebugInput) => ipcRenderer.invoke('debug:register', input),
    clear: (ids: string[]) => ipcRenderer.invoke('debug:clear', ids),
    stop: (ids: string[]) => ipcRenderer.invoke('debug:stop', ids),
    list: () => ipcRenderer.invoke('debug:list'),
    onChanged: (callback: (sessions: DebugSession[]) => void) => on('debug:changed', callback)
  },
  knownHosts: {
    trust: (input: TrustHostInput) => ipcRenderer.invoke('known-hosts:trust', input),
    remove: (id: string) => ipcRenderer.invoke('known-hosts:remove', id)
  },
  sftp: {
    list: (terminalId: string, path: string) => ipcRenderer.invoke('sftp:list', terminalId, path),
    upload: (terminalId: string, remoteDir: string) => ipcRenderer.invoke('sftp:upload', terminalId, remoteDir),
    download: (terminalId: string, remotePath: string) =>
      ipcRenderer.invoke('sftp:download', terminalId, remotePath),
    mkdir: (terminalId: string, path: string) => ipcRenderer.invoke('sftp:mkdir', terminalId, path),
    rename: (terminalId: string, from: string, to: string) =>
      ipcRenderer.invoke('sftp:rename', terminalId, from, to),
    remove: (terminalId: string, path: string, isDirectory: boolean) =>
      ipcRenderer.invoke('sftp:remove', terminalId, path, isDirectory)
  },
  forwards: {
    list: (terminalId: string) => ipcRenderer.invoke('forwards:list', terminalId),
    start: (terminalId: string, remoteHost: string, remotePort: number, localPort?: number) =>
      ipcRenderer.invoke('forwards:start', terminalId, remoteHost, remotePort, localPort),
    stop: (id: string) => ipcRenderer.invoke('forwards:stop', id),
    onChanged: (callback: (forward: PortForward) => void) => on('forward:changed', callback)
  },
  snippets: {
    save: (input: SnippetInput) => ipcRenderer.invoke('snippets:save', input),
    delete: (id: string) => ipcRenderer.invoke('snippets:delete', id)
  },
  updates: {
    check: (force?: boolean) => ipcRenderer.invoke('updates:check', force)
  }
}

contextBridge.exposeInMainWorld('tsterm', api)
