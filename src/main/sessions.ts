import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { randomUUID, createHash } from 'node:crypto'
import { Client } from 'ssh2'
import type { ClientChannel, ConnectConfig } from 'ssh2'
import type {
  ConnectError,
  ConnectLocalOptions,
  ConnectSshOptions,
  CreateResult,
  Host,
  SessionInfo,
  SessionStatus,
  TerminalDataEvent,
  SessionStatusEvent
} from '@shared/types'
import type { Store } from './store'

interface KeyInfo {
  fingerprint: string
  keyType?: string
}

interface SshCredentials {
  password?: string
  passphrase?: string
}

interface ManagedSession {
  info: SessionInfo
  stream?: ClientChannel
  conn?: Client
  jumpConn?: Client
  pty?: {
    write(data: string): void
    resize(cols: number, rows: number): void
    kill(): void
    onData(callback: (data: string) => void): { dispose(): void }
    onExit(callback: () => void): { dispose(): void }
  }
  logStream?: fs.WriteStream
  closed: boolean
}

export interface SessionCallbacks {
  onData: (event: TerminalDataEvent) => void
  onStatus: (event: SessionStatusEvent) => void
  onClosed: (terminalId: string) => void
}

class SshFailure extends Error {
  constructor(
    readonly original: Error,
    readonly host: Host,
    readonly keyInfo?: KeyInfo
  ) {
    super(original.message)
  }
}

function fingerprint(key: Buffer): KeyInfo {
  const digest = createHash('sha256').update(key).digest('base64').replace(/=+$/g, '')
  let keyType: string | undefined
  try {
    if (key.length >= 4) {
      const length = key.readUInt32BE(0)
      if (length > 0 && length <= key.length - 4) keyType = key.subarray(4, 4 + length).toString('ascii')
    }
  } catch {
    // optional
  }
  return { fingerprint: `SHA256:${digest}`, keyType }
}

function shellForPlatform(): { shell: string; args: string[] } {
  if (process.platform === 'win32') {
    const pwsh = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
    if (fs.existsSync(pwsh)) return { shell: pwsh, args: ['-NoLogo'] }
    return { shell: 'powershell.exe', args: ['-NoLogo'] }
  }
  return { shell: process.env.SHELL || '/bin/bash', args: [] }
}

function safeLabel(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'session'
}

function mapSshError(error: Error, host: Host, keyInfo?: KeyInfo, knownFingerprint?: string): ConnectError {
  const message = error.message || String(error)
  const lower = message.toLowerCase()
  const hostKeyFailure = /host key|verification failed/.test(lower)
  if (keyInfo && hostKeyFailure && knownFingerprint !== keyInfo.fingerprint) {
    return {
      code: knownFingerprint ? 'HOST_KEY_MISMATCH' : 'UNKNOWN_HOST_KEY',
      message: knownFingerprint
        ? `The host key for ${host.hostname}:${host.port} has changed. Expected ${knownFingerprint}, received ${keyInfo.fingerprint}.`
        : `The host key for ${host.hostname}:${host.port} is not trusted yet. Verify ${keyInfo.fingerprint} before connecting.`,
      fingerprint: keyInfo.fingerprint,
      keyType: keyInfo.keyType,
      hostname: host.hostname,
      port: host.port
    }
  }
  if (lower.includes('authentication') || lower.includes('all configured authentication methods failed')) {
    return { code: 'AUTH', message: `Authentication failed for ${host.username}@${host.hostname}.` }
  }
  if (
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('ehostunreach') ||
    lower.includes('network is unreachable')
  ) {
    return {
      code: 'NETWORK',
      message: `Could not reach ${host.hostname}:${host.port}. ${message}`.trim(),
      hostname: host.hostname,
      port: host.port
    }
  }
  return { code: 'UNKNOWN', message }
}

export class SessionManager {
  private sessions = new Map<string, ManagedSession>()

  constructor(
    private readonly store: Store,
    private readonly callbacks: SessionCallbacks
  ) {
    // Mark old sessions as gone; sessions never survive an app restart.
    const stale = this.store.getDebugSessions().map((session) => ({ ...session, live: false }))
    this.store.saveDebugSessions(stale)
  }

  getSession(id: string): SessionInfo | undefined {
    const session = this.sessions.get(id)
    return session ? { ...session.info } : undefined
  }

  getClient(id: string): Client | undefined {
    return this.sessions.get(id)?.conn
  }

  isLive(id: string): boolean {
    return this.sessions.has(id) && this.sessions.get(id)?.info.status === 'connected'
  }

  private logPath(hostLabel: string): string {
    const file = path.join(
      this.store.paths.logs,
      `${safeLabel(hostLabel)}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
    )
    return file
  }

  private openLog(hostLabel: string): { stream: fs.WriteStream; path: string } | undefined {
    if (!this.store.getSettings().logSessions) return undefined
    try {
      const logPath = this.logPath(hostLabel)
      const stream = fs.createWriteStream(logPath, { flags: 'a' })
      stream.write(`# TSTerm session log\n# Started: ${new Date().toISOString()}\n\n`)
      return { stream, path: logPath }
    } catch {
      return undefined
    }
  }

  private emitStatus(session: ManagedSession, status: SessionStatus, error?: string): void {
    session.info.status = status
    if (error) session.info.error = error
    this.callbacks.onStatus({
      terminalId: session.info.id,
      status,
      error,
      logPath: session.info.logPath
    })
  }

  private finish(session: ManagedSession, error?: string): void {
    if (session.closed) return
    session.closed = true
    session.stream?.end()
    try {
      session.conn?.end()
    } catch {
      // ignore
    }
    try {
      session.jumpConn?.end()
    } catch {
      // ignore
    }
    try {
      session.pty?.kill()
    } catch {
      // ignore
    }
    session.logStream?.end()
    if (session.info.status !== 'error') this.emitStatus(session, 'disconnected', error)
    this.sessions.delete(session.info.id)
    this.callbacks.onClosed(session.info.id)
  }

  private buildConfig(
    host: Host,
    credentials: SshCredentials,
    opts: { cols: number; rows: number; trustFingerprint?: string; sock?: net.Socket }
  ): { config: ConnectConfig; getKeyInfo: () => KeyInfo | undefined } {
    let keyInfo: KeyInfo | undefined
    const settings = this.store.getSettings()
    const config: ConnectConfig = {
      host: host.hostname,
      port: host.port,
      username: host.username,
      readyTimeout: 20000,
      keepaliveInterval: Math.max(0, host.keepaliveSeconds ?? settings.keepaliveSeconds) * 1000,
      keepaliveCountMax: 3,
      tryKeyboard: host.authType === 'password',
      hostVerifier: (key: Buffer) => {
        keyInfo = fingerprint(key)
        if (!settings.strictHostKeyChecking) return true
        if (opts.trustFingerprint && keyInfo.fingerprint === opts.trustFingerprint) return true
        const known = this.store.findKnownHost(host.hostname, host.port)
        return Boolean(known && known.fingerprint === keyInfo.fingerprint)
      }
    }
    if (opts.sock) config.sock = opts.sock
    if (host.authType === 'password') {
      config.password = credentials.password
    } else if (host.authType === 'key') {
      if (!host.privateKeyPath) throw new Error('No private key file is configured for this host.')
      config.privateKey = fs.readFileSync(host.privateKeyPath)
      if (credentials.passphrase) config.passphrase = credentials.passphrase
    } else {
      const agent = process.platform === 'win32' ? 'pageant' : process.env.SSH_AUTH_SOCK
      if (!agent) throw new Error('No SSH agent is available. Configure SSH_AUTH_SOCK or choose another auth method.')
      config.agent = agent
    }
    return { config, getKeyInfo: () => keyInfo }
  }

  private openClient(
    host: Host,
    credentials: SshCredentials,
    opts: { cols: number; rows: number; trustFingerprint?: string; sock?: net.Socket }
  ): Promise<{ client: Client; keyInfo?: KeyInfo }> {
    return new Promise((resolve, reject) => {
      let built: ReturnType<SessionManager['buildConfig']>
      try {
        built = this.buildConfig(host, credentials, opts)
      } catch (error) {
        reject(new SshFailure(error as Error, host))
        return
      }
      const client = new Client()
      let settled = false
      let keyInfo = built.getKeyInfo()
      const fail = (error: Error): void => {
        if (settled) return
        settled = true
        keyInfo = built.getKeyInfo()
        try {
          client.end()
        } catch {
          // ignore
        }
        reject(new SshFailure(error, host, keyInfo))
      }
      client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
        finish(prompts.map(() => credentials.password ?? ''))
      })
      client.on('ready', () => {
        if (settled) return
        settled = true
        resolve({ client, keyInfo: built.getKeyInfo() })
      })
      client.on('error', fail)
      try {
        client.connect(built.config)
      } catch (error) {
        fail(error as Error)
      }
    })
  }

  async connectSsh(options: ConnectSshOptions): Promise<CreateResult> {
    const host = this.store.getHost(options.hostId)
    if (!host) return { ok: false, error: { code: 'UNKNOWN', message: 'Host not found.' } }
    const stored = this.store.getSecret(host.id)
    const credentials: SshCredentials = {
      password: options.password || stored?.password,
      passphrase: options.passphrase || stored?.passphrase
    }
    if (host.authType === 'password' && !credentials.password) {
      return { ok: false, error: { code: 'AUTH', message: 'This host needs a password before it can connect.' } }
    }
    if (host.authType === 'key' && !host.privateKeyPath) {
      return { ok: false, error: { code: 'UNKNOWN', message: 'Choose a private key file for this host.' } }
    }

    let jumpConn: Client | undefined
    let target: { client: Client; keyInfo?: KeyInfo }
    try {
      if (host.jumpHostId) {
        const jumpHost = this.store.getHost(host.jumpHostId)
        if (!jumpHost) throw new SshFailure(new Error('Jump host not found.'), host)
        const jumpSecret = this.store.getSecret(jumpHost.id)
        if (jumpHost.authType === 'password' && !jumpSecret?.password) {
          throw new SshFailure(new Error(`Jump host "${jumpHost.label}" has no saved password.`), jumpHost)
        }
        const jump = await this.openClient(jumpHost, jumpSecret ?? {}, {
          cols: options.cols,
          rows: options.rows
        })
        jumpConn = jump.client
        const stream = await new Promise<ClientChannel>((resolve, reject) => {
          jump.client.forwardOut('127.0.0.1', 0, host.hostname, host.port, (error, channel) => {
            if (error) reject(error)
            else resolve(channel)
          })
        })
        target = await this.openClient(host, credentials, {
          cols: options.cols,
          rows: options.rows,
          trustFingerprint: options.trustFingerprint,
          sock: stream as unknown as net.Socket
        })
      } else {
        target = await this.openClient(host, credentials, {
          cols: options.cols,
          rows: options.rows,
          trustFingerprint: options.trustFingerprint
        })
      }
    } catch (error) {
      try {
        jumpConn?.end()
      } catch {
        // ignore
      }
      if (error instanceof SshFailure) {
        const known = this.store.findKnownHost(error.host.hostname, error.host.port)
        const mapped = mapSshError(error.original, error.host, error.keyInfo, known?.fingerprint)
        return { ok: false, error: mapped }
      }
      return { ok: false, error: { code: 'UNKNOWN', message: (error as Error).message } }
    }

    const terminalId = randomUUID()
    const log = this.openLog(host.label)
    const logStream = log?.stream
    const info: SessionInfo = {
      id: terminalId,
      kind: 'ssh',
      hostId: host.id,
      title: host.label,
      subtitle: `${host.username}@${host.hostname}:${host.port}`,
      status: 'connecting',
      deviceType: host.deviceType,
      cols: options.cols,
      rows: options.rows,
      startedAt: new Date().toISOString(),
      hostKeyFingerprint: target.keyInfo?.fingerprint,
      logPath: log?.path
    }
    const managed: ManagedSession = {
      info,
      conn: target.client,
      jumpConn,
      logStream,
      closed: false
    }
    this.sessions.set(terminalId, managed)

    return new Promise((resolve) => {
      target.client.shell(
        { term: 'xterm-256color', cols: options.cols, rows: options.rows },
        (error, stream) => {
          if (error) {
            managed.closed = true
            this.sessions.delete(terminalId)
            target.client.end()
            jumpConn?.end()
            logStream?.end()
            resolve({ ok: false, error: mapSshError(error, host, target.keyInfo) })
            return
          }
          managed.stream = stream
          managed.info.connectedAt = new Date().toISOString()
          this.emitStatus(managed, 'connected')
          this.store.touchHost(host.id)

          stream.on('data', (chunk: Buffer) => {
            const text = chunk.toString('utf8')
            logStream?.write(text)
            this.callbacks.onData({ terminalId, data: text })
          })
          stream.on('close', () => this.finish(managed))
          stream.on('error', (streamError: Error) => {
            this.emitStatus(managed, 'error', streamError.message)
            this.finish(managed, streamError.message)
          })
          target.client.on('close', () => this.finish(managed))
          target.client.on('error', (clientError: Error) => {
            this.emitStatus(managed, 'error', clientError.message)
          })

          if (host.startupCommand) {
            setTimeout(() => {
              if (!managed.closed) stream.write(`${host.startupCommand}\n`)
            }, 900)
          }
          resolve({ ok: true, session: { ...managed.info } })
        }
      )
    })
  }

  connectLocal(options: ConnectLocalOptions): CreateResult {
    const settings = this.store.getSettings()
    const terminalId = randomUUID()
    const shellName = options.shell || settings.localShell || shellForPlatform().shell
    const args = settings.localShellArgs.length && !options.shell ? settings.localShellArgs : []
    let ptyModule: typeof import('node-pty')
    try {
      // node-pty is a native module. Keep the import lazy so the rest of the app still starts if it failed to build.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ptyModule = require('node-pty') as typeof import('node-pty')
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'PTY_UNAVAILABLE',
          message: `Local shell support is unavailable (${(error as Error).message}). SSH sessions still work.`
        }
      }
    }

    const log = this.openLog('local')
    const logStream = log?.stream
    const info: SessionInfo = {
      id: terminalId,
      kind: 'local',
      title: options.title || 'Local shell',
      subtitle: path.basename(shellName),
      status: 'connecting',
      shell: shellName,
      cols: options.cols,
      rows: options.rows,
      startedAt: new Date().toISOString(),
      logPath: log?.path
    }
    let ptyProcess: import('node-pty').IPty
    try {
      ptyProcess = ptyModule.spawn(shellName, args, {
        name: 'xterm-256color',
        cols: Math.max(20, options.cols),
        rows: Math.max(5, options.rows),
        cwd: options.cwd || os.homedir(),
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor'
        }
      })
    } catch (error) {
      return {
        ok: false,
        error: { code: 'PTY_UNAVAILABLE', message: (error as Error).message }
      }
    }

    const managed: ManagedSession = {
      info,
      pty: ptyProcess,
      logStream,
      closed: false
    }
    this.sessions.set(terminalId, managed)
    ptyProcess.onData((data) => {
      logStream?.write(data)
      this.callbacks.onData({ terminalId, data })
    })
    ptyProcess.onExit(() => this.finish(managed))
    managed.info.status = 'connected'
    managed.info.connectedAt = new Date().toISOString()
    this.emitStatus(managed, 'connected')
    return { ok: true, session: { ...managed.info } }
  }

  write(terminalId: string, data: string): void {
    const session = this.sessions.get(terminalId)
    if (!session) return
    session.stream?.write(data)
    session.pty?.write(data)
  }

  resize(terminalId: string, cols: number, rows: number): void {
    const session = this.sessions.get(terminalId)
    if (!session) return
    session.info.cols = cols
    session.info.rows = rows
    session.stream?.setWindow(Math.max(2, rows), Math.max(2, cols), 0, 0)
    session.pty?.resize(Math.max(2, cols), Math.max(2, rows))
  }

  close(terminalId: string, options: { silent?: boolean } = {}): void {
    const session = this.sessions.get(terminalId)
    if (!session) return
    if (options.silent) {
      session.closed = true
      session.stream?.end()
      session.conn?.end()
      session.jumpConn?.end()
      session.pty?.kill()
      session.logStream?.end()
      this.sessions.delete(terminalId)
      this.callbacks.onClosed(terminalId)
      return
    }
    this.finish(session)
  }

  closeAll(): void {
    for (const id of [...this.sessions.keys()]) this.close(id, { silent: true })
  }

  cleanupTextFor(commands: string[]): string {
    return commands.join('\n')
  }

  sendCleanup(terminalId: string, commands: string[]): boolean {
    if (!this.isLive(terminalId) || !commands.length) return false
    this.write(terminalId, `${commands.join('\n')}\n`)
    return true
  }
}
