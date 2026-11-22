import type { FitAddon } from '@xterm/addon-fit'
import type { SearchAddon } from '@xterm/addon-search'
import type { Terminal } from '@xterm/xterm'

export interface TerminalHandle {
  terminal: Terminal
  fit: FitAddon
  search: SearchAddon
  clear: () => void
  focus: () => void
  copySelection: () => Promise<boolean>
  paste: () => Promise<void>
  selectAll: () => void
  getSelection: () => string
}

class TerminalRegistry {
  private handles = new Map<string, TerminalHandle>()

  register(id: string, handle: TerminalHandle): () => void {
    this.handles.set(id, handle)
    return () => {
      if (this.handles.get(id) === handle) this.handles.delete(id)
    }
  }

  get(id: string | undefined): TerminalHandle | undefined {
    return id ? this.handles.get(id) : undefined
  }

  findNext(query: string, backwards = false): boolean {
    for (const handle of this.handles.values()) {
      return backwards
        ? handle.search.findPrevious(query, { incremental: true })
        : handle.search.findNext(query, { incremental: true })
    }
    return false
  }
}

export const terminalRegistry = new TerminalRegistry()

export async function copySelection(id: string | undefined): Promise<boolean> {
  const handle = terminalRegistry.get(id)
  if (!handle) return false
  return handle.copySelection()
}

export function clearTerminal(id: string | undefined): void {
  terminalRegistry.get(id)?.clear()
}

export function focusTerminal(id: string | undefined): void {
  terminalRegistry.get(id)?.focus()
}
