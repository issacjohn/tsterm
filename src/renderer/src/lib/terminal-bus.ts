type DataListener = (data: string) => void

class TerminalDataBus {
  private buffers = new Map<string, string>()
  private listeners = new Map<string, Set<DataListener>>()

  ingest(terminalId: string, data: string): void {
    const current = this.listeners.get(terminalId)
    if (current && current.size) {
      for (const listener of current) listener(data)
      return
    }
    const existing = this.buffers.get(terminalId) ?? ''
    const next = (existing + data).slice(-2_000_000)
    this.buffers.set(terminalId, next)
  }

  subscribe(terminalId: string, listener: DataListener): () => void {
    let set = this.listeners.get(terminalId)
    if (!set) {
      set = new Set()
      this.listeners.set(terminalId, set)
    }
    set.add(listener)
    const buffered = this.buffers.get(terminalId)
    if (buffered) {
      this.buffers.delete(terminalId)
      listener(buffered)
    }
    return () => {
      set?.delete(listener)
      if (set && set.size === 0) this.listeners.delete(terminalId)
    }
  }

  release(terminalId: string): void {
    this.buffers.delete(terminalId)
    this.listeners.delete(terminalId)
  }
}

export const terminalDataBus = new TerminalDataBus()
