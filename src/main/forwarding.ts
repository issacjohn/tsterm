import net from 'node:net'
import { randomUUID } from 'node:crypto'
import type { PortForward } from '@shared/types'
import type { SessionManager } from './sessions'

interface ActiveForward {
  info: PortForward
  server?: net.Server
}

export class ForwardManager {
  private forwards = new Map<string, ActiveForward>()

  constructor(
    private readonly terminals: SessionManager,
    private readonly onChange: (forward: PortForward) => void
  ) {}

  list(terminalId: string): PortForward[] {
    return [...this.forwards.values()]
      .filter((forward) => forward.info.terminalId === terminalId)
      .map((forward) => ({ ...forward.info }))
  }

  async start(
    terminalId: string,
    remoteHost: string,
    remotePort: number,
    localPort = 0
  ): Promise<PortForward> {
    const client = this.terminals.getClient(terminalId)
    if (!client) throw new Error('Port forwarding is available on live SSH sessions only.')
    if (!remoteHost.trim()) throw new Error('Remote host is required.')
    if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) {
      throw new Error('Remote port must be between 1 and 65535.')
    }
    if (!Number.isInteger(localPort) || localPort < 0 || localPort > 65535) {
      throw new Error('Local port must be between 1 and 65535 (or 0 to pick one).')
    }

    const info: PortForward = {
      id: randomUUID(),
      terminalId,
      localPort,
      remoteHost: remoteHost.trim(),
      remotePort,
      status: 'starting',
      startedAt: new Date().toISOString()
    }
    const active: ActiveForward = { info }
    this.forwards.set(info.id, active)
    this.onChange({ ...info })

    const server = net.createServer((socket) => {
      socket.on('error', () => socket.destroy())
      client.forwardOut(
        socket.remoteAddress || '127.0.0.1',
        socket.remotePort || 0,
        info.remoteHost,
        info.remotePort,
        (error, stream) => {
          if (error) {
            socket.destroy()
            info.status = 'error'
            info.error = error.message
            this.onChange({ ...info })
            return
          }
          socket.pipe(stream).pipe(socket)
          stream.on('error', () => socket.destroy())
          stream.on('close', () => socket.destroy())
          socket.on('close', () => stream.close())
        }
      )
    })
    active.server = server

    await new Promise<void>((resolve, reject) => {
      server.once('error', (error) => {
        info.status = 'error'
        info.error = error.message
        this.onChange({ ...info })
        reject(error)
      })
      server.listen(localPort, '127.0.0.1', () => {
        const address = server.address()
        if (address && typeof address === 'object') info.localPort = address.port
        info.status = 'active'
        this.onChange({ ...info })
        resolve()
      })
    })
    return { ...info }
  }

  stop(id: string): void {
    const active = this.forwards.get(id)
    if (!active) return
    active.server?.close()
    active.info.status = 'stopped'
    this.forwards.delete(id)
    this.onChange({ ...active.info })
  }

  stopForTerminal(terminalId: string): void {
    for (const [id, forward] of [...this.forwards.entries()]) {
      if (forward.info.terminalId === terminalId) this.stop(id)
    }
  }

  stopAll(): void {
    for (const id of [...this.forwards.keys()]) this.stop(id)
  }
}
