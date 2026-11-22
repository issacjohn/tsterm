import path from 'node:path'
import { app, BrowserWindow, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import type { MenuCommand } from '@shared/types'
import { Store } from './store'
import { CatalogService } from './catalog'
import { SessionManager } from './sessions'
import { DebugManager } from './debug'
import { SftpService } from './sftp'
import { ForwardManager } from './forwarding'
import { QuitCoordinator } from './quit'
import { UpdateService } from './updates'
import { registerIpc, sendMenuCommand } from './ipc'

app.setName('TSTerm')
if (process.platform === 'win32') app.setAppUserModelId('com.tsterm.desktop')
if (process.env.TSTERM_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.TSTERM_USER_DATA))
}

let mainWindow: BrowserWindow | null = null
let store: Store
let catalog: CatalogService
let sessions: SessionManager
let debug: DebugManager
let sftp: SftpService
let forwards: ForwardManager
let quit: QuitCoordinator
let updates: UpdateService

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

function catalogDirectory(): string {
  if (process.env.TSTERM_CATALOG_DIR) return path.resolve(process.env.TSTERM_CATALOG_DIR)
  return app.isPackaged
    ? path.join(process.resourcesPath, 'catalog')
    : path.join(app.getAppPath(), 'resources', 'catalog')
}

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function buildMenu(): void {
  const command = (label: string, menuCommand: MenuCommand, accelerator?: string): MenuItemConstructorOptions => ({
    label,
    accelerator,
    click: () => sendMenuCommand(menuCommand)
  })
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        command('New SSH Connection', 'new-ssh', 'CmdOrCtrl+Shift+N'),
        command('New Local Terminal', 'new-local', 'CmdOrCtrl+Shift+T'),
        { type: 'separator' },
        command('Close Tab', 'close-tab', 'CmdOrCtrl+Shift+W'),
        { type: 'separator' },
        command('Settings', 'settings', 'CmdOrCtrl+,'),
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const }])
      ]
    },
    {
      label: 'Session',
      submenu: [
        command('Reconnect', 'reconnect', 'CmdOrCtrl+Shift+R'),
        command('SFTP Browser', 'sftp', 'CmdOrCtrl+Shift+S'),
        command('Troubleshoot Panel', 'troubleshoot'),
        { type: 'separator' },
        command('Command Palette', 'command-palette', 'CmdOrCtrl+Shift+P'),
        command('Keyboard Shortcuts', 'shortcuts', 'F1')
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open TSTerm data folder',
          click: () => {
            if (store) void shell.openPath(store.paths.appData)
          }
        },
        {
          label: 'About TSTerm',
          click: () => {
            const window = BrowserWindow.getFocusedWindow()
            if (window) window.webContents.send('app:menu-command', 'shortcuts')
          }
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus()
    return
  }
  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    title: 'TSTerm',
    backgroundColor: '#0a1016',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      webSecurity: true
    }
  })
  mainWindow = window
  quit?.setWindow(window)
  window.once('ready-to-show', () => window.show())
  window.on('close', (event) => {
    quit?.handleWindowClose(event)
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
    quit?.setWindow(null)
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

async function boot(): Promise<void> {
  store = new Store(app.getPath('userData'))
  catalog = new CatalogService(catalogDirectory(), store.paths.customCatalog)
  catalog.load()
  sessions = new SessionManager(store, {
    onData: (event) => send('terminal:data', event),
    onStatus: (event) => send('terminal:status', event),
    onClosed: (terminalId) => {
      debug?.onTerminalClosed(terminalId)
      forwards?.stopForTerminal(terminalId)
    }
  })
  debug = new DebugManager(store, sessions, (active) => send('debug:changed', active))
  sftp = new SftpService(sessions)
  forwards = new ForwardManager(sessions, (forward) => send('forward:changed', forward))
  updates = new UpdateService(store, app.getVersion())
  quit = new QuitCoordinator(debug, sessions)
  registerIpc({
    store,
    catalog,
    sessions,
    debug,
    sftp,
    forwards,
    quit,
    updates,
    getWindow: () => mainWindow
  })
  buildMenu()
  createWindow()
}

if (gotLock) {
  app.whenReady().then(boot).catch((error) => {
    console.error('[TSTerm] Failed to start:', error)
    app.quit()
  })
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  } else if (store) {
    createWindow()
  }
})

app.on('activate', () => {
  if (!mainWindow && store) createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  quit?.handleBeforeQuit(event)
})

app.on('will-quit', () => {
  forwards?.stopAll()
})

process.on('uncaughtException', (error) => {
  console.error('[TSTerm] uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[TSTerm] unhandled rejection:', reason)
})
