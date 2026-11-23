import type { AiChatContext, DeviceType, Snippet, Workflow } from '@shared/types'
import {
  promptInputText,
  sanitizeTerminalText,
  stripPromptPrefix,
  toFillableCommand
} from '@shared/ai-utils'
import {
  buildRunbook,
  initialValues,
  runbookCleanupCommands,
  runbookCommands,
  searchWorkflows
} from '@shared/catalog-utils'
import { activePane, useAppStore } from '../store'
import { isPasswordPrompt } from './suggestions'
import { terminalRegistry } from './terminal-registry'

export {
  analyzeAiCommands,
  extractCommands,
  extractInlineCommands,
  looksLikeCommand,
  parseAiContent,
  sanitizeTerminalText,
  stripPromptPrefix,
  toFillableCommand
} from '@shared/ai-utils'
export type { AiBlock, AiSegment } from '@shared/ai-utils'

const MAX_TAIL_LINES = 80
const MAX_TAIL_CHARS = 6000
const MAX_HINTS = 6

export interface TerminalSnapshot {
  tail?: string
  currentCommand?: string
}

export function readTerminalSnapshot(sessionId: string | undefined): TerminalSnapshot {
  if (!sessionId) return {}
  const handle = terminalRegistry.get(sessionId)
  if (!handle) return {}
  const buffer = handle.terminal.buffer.active
  if (buffer.type !== 'normal') return {}
  const end = buffer.baseY + buffer.cursorY
  const start = Math.max(0, end - MAX_TAIL_LINES)
  const lines: string[] = []
  for (let index = start; index <= end; index += 1) {
    lines.push(buffer.getLine(index)?.translateToString(true) ?? '')
  }
  const currentLine = buffer.getLine(end)?.translateToString(false) ?? ''
  const currentCommand = stripPromptPrefix(
    sanitizeTerminalText(currentLine.slice(0, buffer.cursorX))
  )
  const tail = sanitizeTerminalText(lines.join('\n')).trim().slice(-MAX_TAIL_CHARS)
  return {
    tail: tail || undefined,
    currentCommand: currentCommand || undefined
  }
}

function describeWorkflow(workflow: Workflow): string {
  const runbook = buildRunbook(workflow, initialValues(workflow))
  const commands = runbookCommands(runbook).slice(0, 6)
  const cleanup =
    workflow.effect === 'debug' || workflow.effect === 'capture'
      ? runbookCleanupCommands(runbook).slice(0, 4)
      : []
  return [
    `### ${workflow.title} (${workflow.severity}, ${workflow.effect})`,
    workflow.summary,
    commands.length ? `Commands:\n${commands.join('\n')}` : '',
    cleanup.length ? `Cleanup:\n${cleanup.join('\n')}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildRunbookHints(type: DeviceType | undefined, query: string): string[] {
  if (!type) return []
  try {
    const hits = searchWorkflows(type, query)
    const hints = hits
      .slice(0, MAX_HINTS)
      .map(({ workflow }) => describeWorkflow(workflow).slice(0, 1600))
    if (hits.length < 3) {
      const categories = type.categories.map((category) => category.name).join(' · ')
      const titles = type.workflows
        .slice(0, 90)
        .map((workflow) => `- ${workflow.title}`)
        .join('\n')
      hints.push(
        `### TSTerm catalog coverage\nCategories: ${categories}\nRunbook titles:\n${titles}`.slice(
          0,
          4000
        )
      )
    }
    return hints
  } catch {
    return []
  }
}

export interface AiContextOptions {
  includeContext: boolean
  prompt: string
}

export function collectAiContext(options: AiContextOptions): AiChatContext {
  const state = useAppStore.getState()
  const pane = activePane(state)
  const type = state.catalog.types.find((item) => item.id === pane?.deviceTypeId)
  const host = state.hosts.find((item) => item.id === pane?.hostId)
  const snapshot = options.includeContext ? readTerminalSnapshot(pane?.sessionId) : {}

  return {
    deviceTypeName: type?.name,
    vendor: type?.vendor,
    family: type?.family,
    hostLabel: host?.label ?? pane?.title,
    // Device packs and runbook knowledge come from the local catalog, not the
    // terminal. They are safe to include even when live context is off.
    deviceNotes: type?.notes.slice(0, 10),
    terminalTail: options.includeContext ? snapshot.tail : undefined,
    currentCommand: options.includeContext ? snapshot.currentCommand : undefined,
    runbookHints: buildRunbookHints(type, options.prompt)
  }
}

export type FillPromptResult = { ok: true } | { ok: false; reason: string }

/** User-initiated only. Writes one line, never a newline or Enter key. */
export function fillTerminalPrompt(sessionId: string, command: string): FillPromptResult {
  const clean = toFillableCommand(command)
  if (!clean) {
    return { ok: false, reason: 'That command is empty, multi-line, or too long.' }
  }
  const handle = terminalRegistry.get(sessionId)
  if (!handle) return { ok: false, reason: 'The terminal is no longer available.' }
  const buffer = handle.terminal.buffer.active
  if (buffer.type !== 'normal') {
    return { ok: false, reason: 'Close the full-screen program before filling a command.' }
  }
  const line = buffer.getLine(buffer.baseY + buffer.cursorY)
  const beforeCursor = (line?.translateToString(false) ?? '').slice(0, buffer.cursorX)
  if (isPasswordPrompt(beforeCursor)) {
    return { ok: false, reason: 'The terminal is waiting for a password. Filling is blocked.' }
  }
  if (promptInputText(beforeCursor)) {
    return {
      ok: false,
      reason: 'The prompt already has text. Clear that line before filling a command.'
    }
  }
  window.tsterm.terminals.write(sessionId, clean)
  handle.focus()
  return { ok: true }
}

export async function saveCommandsAsSnippet(input: {
  title: string
  commands: string[]
  deviceTypeId?: string
}): Promise<Snippet[]> {
  const command = input.commands.join('\n').trim()
  if (!command) throw new Error('There are no commands to save.')
  const snippets = await window.tsterm.snippets.save({
    title: input.title.trim() || 'AI assistant commands',
    command,
    description: 'Saved from the TSTerm AI assistant. Review before running.',
    tags: ['ai'],
    deviceTypeId: input.deviceTypeId
  })
  useAppStore.getState().setSnippets(snippets)
  return snippets
}
