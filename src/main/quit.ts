import { app, dialog, type BrowserWindow } from 'electron'
import type { DebugSession, QuitAction } from '@shared/types'
import type { DebugManager } from './debug'
import type { SessionManager } from './sessions'

export class QuitCoordinator {
  private allowQuit = false
  private pending = false
  private timeout?: NodeJS.Timeout
  private window: BrowserWindow | null = null

  constructor(
    private readonly debug: DebugManager,
    private readonly terminals: SessionManager
  ) {}

  setWindow(window: BrowserWindow | null): void {
    this.window = window
    if (window) {
      this.allowQuit = false
      this.pending = false
    }
  }

  handleWindowClose(event: Electron.Event): void {
    if (this.allowQuit) return
    if (!this.debug.hasActive()) {
      this.allowQuit = true
      return
    }
    event.preventDefault()
    this.requestQuit('window')
  }

  handleBeforeQuit(event: Electron.Event): void {
    if (this.allowQuit) return
    if (!this.debug.hasActive()) {
      this.allowQuit = true
      return
    }
    event.preventDefault()
    this.requestQuit('app')
  }

  action(action: QuitAction): void {
    if (action === 'cancel') {
      this.pending = false
      if (this.timeout) clearTimeout(this.timeout)
      this.timeout = undefined
      return
    }
    if (action === 'force') {
      this.pending = false
      if (this.timeout) clearTimeout(this.timeout)
      this.timeout = undefined
      this.finishQuit()
      return
    }
    this.pending = false
    if (this.timeout) clearTimeout(this.timeout)
    this.timeout = undefined
    const result = this.debug.stopAllForQuit()
    if (result.cleanupFile) {
      // The result already copied cleanup to the clipboard. Keep a file path in the log for support.
      console.info(`[TSTerm] debug cleanup written to ${result.cleanupFile}`)
    }
    setTimeout(() => this.finishQuit(), 850)
  }

  private finishQuit(): void {
    this.allowQuit = true
    this.terminals.closeAll()
    app.quit()
  }

  private requestQuit(_source: 'window' | 'app'): void {
    if (this.pending) return
    this.pending = true
    const sessions = this.debug.list()
    if (!sessions.length) {
      this.finishQuit()
      return
    }
    const window = this.window
    if (window && !window.isDestroyed()) {
      window.webContents.send('app:quit-request', sessions)
      this.timeout = setTimeout(() => {
        this.pending = false
        this.nativePrompt(sessions)
      }, 20000)
      return
    }
    this.nativePrompt(sessions)
  }

  private nativePrompt(sessions: DebugSession[]): void {
    this.pending = false
    const hasLive = sessions.some((session) => session.live)
    const cleanup = sessions
      .map((session) => {
        const where = session.hostname ? `${session.hostLabel} (${session.hostname})` : session.hostLabel
        return `${where}\n  ${session.workflowTitle}\n  ${session.cleanup.join('\n  ')}`
      })
      .join('\n\n')
    const detail = `${sessions.length} troubleshooting session${sessions.length === 1 ? '' : 's'} may still have debugs or captures running.\n\n${cleanup}`.slice(
      0,
      1800
    )
    const buttons = hasLive
      ? ['Stop debugs & quit', 'Quit without stopping', 'Cancel']
      : ['Copy cleanup & quit', 'Quit anyway', 'Cancel']
    const result = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Debug sessions are still active',
      message: `${sessions.length} debug session${sessions.length === 1 ? '' : 's'} may still be running.`,
      detail,
      buttons,
      defaultId: 0,
      cancelId: 2,
      noLink: true
    })
    if (result === 2) return
    if (result === 0) {
      const stopped = this.debug.stopAllForQuit()
      if (!stopped.stoppedLive && stopped.copied) {
        // No live terminal exists; the cleanup is now on the clipboard and in a file.
        setTimeout(() => this.finishQuit(), 250)
        return
      }
      setTimeout(() => this.finishQuit(), 850)
      return
    }
    this.finishQuit()
  }
}
