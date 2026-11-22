import { clipboard } from 'electron'
import { randomUUID } from 'node:crypto'
import type { DebugSession, DebugStopResult, RegisterDebugInput } from '@shared/types'
import type { Store } from './store'
import type { SessionManager } from './sessions'

export class DebugManager {
  private sessions: DebugSession[]

  constructor(
    private readonly store: Store,
    private readonly terminals: SessionManager,
    private readonly onChange: (sessions: DebugSession[]) => void
  ) {
    this.sessions = this.store.getDebugSessions().map((session) => ({ ...session, live: false }))
    this.persist()
  }

  list(): DebugSession[] {
    return structuredClone(this.sessions)
  }

  hasActive(): boolean {
    return this.sessions.length > 0
  }

  register(input: RegisterDebugInput): DebugSession[] {
    const live = input.mode === 'sent' && Boolean(input.terminalId && this.terminals.isLive(input.terminalId))
    const existing = this.sessions.find(
      (session) =>
        (input.terminalId && session.terminalId === input.terminalId && session.workflowId === input.workflowId) ||
        (!input.terminalId &&
          session.hostLabel === input.hostLabel &&
          session.workflowId === input.workflowId &&
          session.mode === input.mode)
    )
    if (existing) {
      existing.cleanup = input.cleanup
      existing.effect = input.effect
      existing.mode = input.mode
      existing.live = live
      existing.hostLabel = input.hostLabel
      existing.hostname = input.hostname
      existing.hostId = input.hostId
      existing.deviceTypeId = input.deviceTypeId
      existing.deviceTypeName = input.deviceTypeName
      existing.workflowTitle = input.workflowTitle
    } else {
      this.sessions.push({
        id: randomUUID(),
        terminalId: input.terminalId,
        hostId: input.hostId,
        hostLabel: input.hostLabel,
        hostname: input.hostname,
        deviceTypeId: input.deviceTypeId,
        deviceTypeName: input.deviceTypeName,
        workflowId: input.workflowId,
        workflowTitle: input.workflowTitle,
        effect: input.effect,
        cleanup: input.cleanup,
        startedAt: new Date().toISOString(),
        mode: input.mode,
        live
      })
    }
    this.persist()
    return this.list()
  }

  clear(ids: string[]): DebugSession[] {
    if (!ids.length) return this.list()
    const remove = new Set(ids)
    this.sessions = this.sessions.filter((session) => !remove.has(session.id))
    this.persist()
    return this.list()
  }

  onTerminalClosed(terminalId: string): void {
    let changed = false
    for (const session of this.sessions) {
      if (session.terminalId === terminalId && session.live) {
        session.live = false
        changed = true
      }
    }
    if (changed) this.persist()
  }

  stop(ids: string[]): DebugStopResult {
    const requested = this.sessions.filter((session) => ids.includes(session.id))
    if (requested.length === 0) {
      return { sessions: this.list(), cleared: 0, stoppedLive: 0, copied: false }
    }
    let stoppedLive = 0
    const cleanupBlocks: string[] = []
    for (const session of requested) {
      if (session.live && session.terminalId && this.terminals.sendCleanup(session.terminalId, session.cleanup)) {
        stoppedLive += 1
      }
      if (session.cleanup.length) {
        const device = session.hostname ? `${session.hostLabel} (${session.hostname})` : session.hostLabel
        cleanupBlocks.push(
          `# ${device} — ${session.workflowTitle}${session.live ? '' : ' (not connected — run manually)'}`,
          ...session.cleanup,
          ''
        )
      }
    }
    const remove = new Set(ids)
    this.sessions = this.sessions.filter((session) => !remove.has(session.id))
    let cleanupFile: string | undefined
    let copied = false
    if (cleanupBlocks.length) {
      const text = [
        '# TSTerm debug cleanup',
        `# Generated: ${new Date().toISOString()}`,
        '# Paste these commands into the device(s) if they were not already sent.',
        '',
        ...cleanupBlocks
      ].join('\n')
      clipboard.writeText(text)
      copied = true
      try {
        cleanupFile = this.store.cleanupFile(text)
      } catch {
        // file is a best-effort fallback
      }
    }
    this.persist()
    return { sessions: this.list(), cleared: requested.length, stoppedLive, copied, cleanupFile }
  }

  stopAllForQuit(): DebugStopResult {
    return this.stop(this.sessions.map((session) => session.id))
  }

  clearAll(): DebugSession[] {
    this.sessions = []
    this.persist()
    return this.list()
  }

  private persist(): void {
    this.store.saveDebugSessions(this.sessions)
    this.onChange(this.list())
  }
}
