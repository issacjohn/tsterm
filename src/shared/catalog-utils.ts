import type {
  Category,
  Condition,
  DeviceType,
  RenderedStep,
  Runbook,
  Workflow,
  WorkflowStep,
  WorkflowVariable
} from './types'

/* ------------------------------------------------------------------ lookup */

export interface WorkflowWithCategory {
  workflow: Workflow
  category: Category
}

export function getCategory(type: DeviceType, id: string): Category | undefined {
  return type.categories.find((category) => category.id === id)
}

export function getWorkflow(type: DeviceType, id: string): Workflow | undefined {
  return type.workflows.find((workflow) => workflow.id === id)
}

export function allWorkflows(type: DeviceType): WorkflowWithCategory[] {
  const order = new Map(type.categories.map((category, index) => [category.id, index]))
  return type.workflows
    .map((workflow) => ({ workflow, category: getCategory(type, workflow.category)! }))
    .filter((item) => Boolean(item.category))
    .sort((a, b) => {
      const byCategory = (order.get(a.category.id) ?? 99) - (order.get(b.category.id) ?? 99)
      return byCategory || a.workflow.title.localeCompare(b.workflow.title)
    })
}

export function findType(typeId: string): (type: DeviceType) => boolean {
  return (type) => type.id === typeId
}

/* ------------------------------------------------------------------ search */

export interface SearchHit {
  workflow: Workflow
  category: Category
  score: number
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'to', 'for', 'and', 'of', 'in', 'on', 'with', 'all',
  'how', 'what', 'when', 'where', 'why', 'who', 'which', 'is', 'are', 'was', 'were',
  'be', 'been', 'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will',
  'my', 'our', 'we', 'i', 'you', 'it', 'this', 'that', 'these', 'those',
  'please', 'help', 'issue', 'problem', 'trouble', 'troubleshooting',
  'not', 'no', 'yes', 'get', 'getting'
])

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_./-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function stem(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.length > 4 && /(ches|shes|xes|ses)$/.test(token)) return token.slice(0, -2)
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3)
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2)
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1)
  return token
}

function normalizeSearch(value: string): string {
  return normalize(value)
    .split(' ')
    .filter(Boolean)
    .map(stem)
    .join(' ')
}

function queryTokens(query: string): string[] {
  return normalize(query)
    .split(' ')
    .filter((token) => token && !STOP_WORDS.has(token))
    .map(stem)
}

function boundaryIncludes(haystack: string, token: string): boolean {
  if (!haystack) return false
  let index = haystack.indexOf(token)
  while (index !== -1) {
    const before = index === 0 ? ' ' : haystack[index - 1]
    if (/[\s/|,>:-]/.test(before)) return true
    index = haystack.indexOf(token, index + 1)
  }
  return false
}

function workflowSearchBlob(workflow: Workflow, category: Category): {
  title: string
  keywords: string
  summary: string
  category: string
  commands: string
  variables: string
  notes: string
  tags: string
} {
  const commands = [...workflow.steps, ...workflow.verify, ...workflow.cleanup]
    .map((step) => [step.command, step.instruction, step.note].filter(Boolean).join(' '))
    .join(' ')
  const variables = workflow.variables
    .map((variable) => `${variable.name} ${variable.prompt} ${variable.help ?? ''}`)
    .join(' ')
  return {
    title: normalizeSearch(`${workflow.title} ${workflow.id.replace(/-/g, ' ')}`),
    keywords: normalizeSearch(workflow.keywords.join(' ')),
    summary: normalizeSearch(workflow.summary),
    category: normalizeSearch(`${category.name} ${category.description ?? ''}`),
    commands: normalizeSearch(commands),
    variables: normalizeSearch(variables),
    notes: normalizeSearch([...workflow.notes, ...workflow.requires].join(' ')),
    tags: normalizeSearch(workflow.tags.join(' '))
  }
}

function scoreMatch(
  blob: ReturnType<typeof workflowSearchBlob>,
  token: string
): number {
  if (!token) return 0
  let score = 0
  if (boundaryIncludes(blob.title, token)) score += 56
  else if (blob.title.includes(token)) score += 38
  if (blob.keywords.includes(token)) score += 44
  if (blob.tags.includes(token)) score += 30
  if (blob.category.includes(token)) score += 22
  if (blob.summary.includes(token)) score += 18
  if (blob.variables.includes(token)) score += 12
  if (blob.commands.includes(token)) score += 9
  if (blob.notes.includes(token)) score += 6
  return score
}

export interface SearchOptions {
  partial?: boolean
  minCoverage?: number
}

export function searchWorkflows(
  type: DeviceType,
  query: string,
  options: SearchOptions = {}
): SearchHit[] {
  const items = allWorkflows(type)
  const tokens = queryTokens(query)
  if (tokens.length === 0) {
    return items.map(({ workflow, category }) => ({ workflow, category, score: 0 }))
  }
  const phrase = normalizeSearch(query)
  const hits: SearchHit[] = []
  for (const { workflow, category } of items) {
    const blob = workflowSearchBlob(workflow, category)
    let score = 0
    let matched = 0
    for (const token of tokens) {
      const tokenScore = scoreMatch(blob, token)
      if (tokenScore > 0) {
        matched += 1
        score += tokenScore
      }
    }
    if (matched === 0) continue
    if (!options.partial) {
      if (matched !== tokens.length) continue
    } else {
      const coverage = matched / tokens.length
      const minimum = options.minCoverage ?? (tokens.length <= 2 ? 0.5 : 0.25)
      if (coverage < minimum) continue
      score += coverage * 60
    }
    if (blob.title.includes(phrase)) score += 80
    if (workflow.id === phrase.replace(/\s+/g, '-')) score += 60
    hits.push({ workflow, category, score })
  }
  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const catA = type.categories.findIndex((category) => category.id === a.category.id)
    const catB = type.categories.findIndex((category) => category.id === b.category.id)
    return catA - catB || a.workflow.title.localeCompare(b.workflow.title)
  })
  return hits
}

export interface GlobalSearchHit extends SearchHit {
  type: DeviceType
}

export function searchAllTypes(types: DeviceType[], query: string, limit = 80): GlobalSearchHit[] {
  const hits: GlobalSearchHit[] = []
  for (const type of types) {
    for (const hit of searchWorkflows(type, query)) {
      const typeBlob = normalize(`${type.name} ${type.vendor} ${type.family} ${type.aliases.join(' ')}`)
      let bonus = 0
      for (const token of queryTokens(query)) {
        if (typeBlob.includes(token)) bonus += 8
      }
      hits.push({ ...hit, type, score: hit.score + bonus })
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.type.name.localeCompare(b.type.name)).slice(0, limit)
}

export function filterDeviceTypes(types: DeviceType[], query: string): DeviceType[] {
  const tokens = queryTokens(query)
  if (!tokens.length) return types
  const scored = types
    .map((type) => {
      const blob = normalize(
        `${type.name} ${type.vendor} ${type.family} ${type.description} ${type.aliases.join(' ')} ${type.id.replace(/-/g, ' ')}`
      )
      let score = 0
      for (const token of tokens) {
        if (!blob.includes(token)) return { type, score: -1 }
        score += boundaryIncludes(blob, token) ? 20 : 8
      }
      return { type, score }
    })
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.type.name.localeCompare(b.type.name))
  return scored.map((item) => item.type)
}

/* --------------------------------------------------------------- variables */

function ipv4(value: string): boolean {
  const parts = value.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
}

function ipv6(value: string): boolean {
  if (!value.includes(':')) return false
  if (value.includes(':::')) return false
  const halves = value.split('::')
  if (halves.length > 2) return false
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length > 1 && halves[1] ? halves[1].split(':') : []
  const all = [...left, ...right]
  if (halves.length === 2 && all.length >= 8) return false
  if (halves.length === 1 && all.length !== 8) return false
  if (all.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) {
    // allow a trailing IPv4 literal in a mixed address
    const last = all[all.length - 1]
    if (!last || !ipv4(last)) return false
    all.pop()
    if (all.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) return false
    if (halves.length === 1 && all.length !== 6) return false
  }
  return true
}

export function validateVariable(variable: WorkflowVariable, rawValue: string): string | null {
  const value = rawValue ?? ''
  if (!value.trim()) {
    return variable.required ? `${variable.prompt} is required.` : null
  }
  switch (variable.type) {
    case 'ip':
      if (!ipv4(value) && !ipv6(value)) return 'Enter a valid IPv4 or IPv6 address.'
      break
    case 'ipv4':
      if (!ipv4(value)) return 'Enter a valid IPv4 address.'
      break
    case 'ipv6':
      if (!ipv6(value)) return 'Enter a valid IPv6 address.'
      break
    case 'int': {
      if (!/^-?\d+$/.test(value)) return 'Enter a whole number.'
      const number = Number(value)
      if (variable.min !== undefined && number < variable.min) return `Must be at least ${variable.min}.`
      if (variable.max !== undefined && number > variable.max) return `Must be at most ${variable.max}.`
      break
    }
    case 'port': {
      if (!/^\d+$/.test(value)) return 'Enter a port number.'
      const port = Number(value)
      if (port < 1 || port > 65535) return 'Port must be between 1 and 65535.'
      break
    }
    case 'choice':
      if (!variable.choices.some((choice) => choice.value === value)) return 'Choose one of the listed values.'
      break
    case 'interface':
      if (!/^[^\s]{1,64}$/.test(value)) return 'Enter an interface name without spaces.'
      break
    case 'mac':
      if (!/^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$/.test(value) && !/^([0-9a-fA-F]{4}\.){2}[0-9a-fA-F]{4}$/.test(value)) {
        return 'Enter a MAC address such as 0011.2233.4455 or 00:11:22:33:44:55.'
      }
      break
    case 'hostname':
      if (/\s/.test(value) || /[/\\]/.test(value)) return 'Enter a hostname or IP address without spaces or slashes.'
      if (value.length > 253) return 'Hostname is too long.'
      break
    case 'string':
    default:
      break
  }
  if (variable.pattern) {
    try {
      if (!new RegExp(`^(?:${variable.pattern})$`).test(value)) return 'The value does not match the required format.'
    } catch {
      return 'This variable has an invalid validation pattern.'
    }
  }
  return null
}

export function initialValues(workflow: Workflow): Record<string, string> {
  const values: Record<string, string> = {}
  for (const variable of workflow.variables) {
    values[variable.name] =
      variable.default ||
      (variable.type === 'choice' && variable.choices.length ? variable.choices[0].value : '')
  }
  return values
}

export function validateValues(
  workflow: Workflow,
  values: Record<string, string>
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const variable of workflow.variables) {
    const error = validateVariable(variable, values[variable.name] ?? '')
    if (error) errors[variable.name] = error
  }
  return errors
}

export function maskValues(
  workflow: Workflow,
  values: Record<string, string>
): Record<string, string> {
  const masked: Record<string, string> = { ...values }
  for (const variable of workflow.variables) {
    if (variable.sensitive && masked[variable.name]) {
      masked[variable.name] = '••••••••'
    }
  }
  return masked
}

/* -------------------------------------------------------------- conditions */

export function conditionMet(condition: Condition, values: Record<string, string>): boolean {
  const value = values[condition.var] ?? ''
  if (condition.equals !== undefined && value !== condition.equals) return false
  if (condition.notEquals !== undefined && value === condition.notEquals) return false
  if (condition.notEmpty === true && !value.trim()) return false
  if (condition.empty === true && value.trim()) return false
  return true
}

export function stepIncluded(step: WorkflowStep, values: Record<string, string>): boolean {
  if (step.when && !conditionMet(step.when, values)) return false
  if (step.unless && conditionMet(step.unless, values)) return false
  return true
}

/* --------------------------------------------------------------- rendering */

export function substitute(text: string, values: Record<string, string>): string {
  const open = '\u0000OPEN\u0000'
  const close = '\u0000CLOSE\u0000'
  return text
    .replace(/\{\{/g, open)
    .replace(/\}\}/g, close)
    .replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_match, name: string) => values[name] ?? '')
    .replace(new RegExp(open, 'g'), '{')
    .replace(new RegExp(close, 'g'), '}')
}

function rendered(
  step: WorkflowStep,
  values: Record<string, string>,
  section: 'primary' | 'verify' | 'cleanup',
  index: number
): RenderedStep {
  return {
    index,
    command: step.command ? substitute(step.command, values) : undefined,
    instruction: step.instruction ? substitute(step.instruction, values) : undefined,
    note: step.note ? substitute(step.note, values) : undefined,
    section
  }
}

export function buildRunbook(workflow: Workflow, values: Record<string, string>): Runbook {
  const primary: RenderedStep[] = []
  const verify: RenderedStep[] = []
  const cleanup: RenderedStep[] = []
  let index = 1
  for (const step of workflow.steps) {
    if (!stepIncluded(step, values)) continue
    primary.push(rendered(step, values, 'primary', index++))
  }
  for (const step of workflow.verify) {
    if (!stepIncluded(step, values)) continue
    verify.push(rendered(step, values, 'verify', index++))
  }
  for (const step of workflow.cleanup) {
    if (!stepIncluded(step, values)) continue
    cleanup.push(rendered(step, values, 'cleanup', index++))
  }
  return {
    workflowId: workflow.id,
    workflowTitle: workflow.title,
    values: { ...values },
    primary,
    verify,
    cleanup
  }
}

export function runbookCommands(runbook: Runbook, includeVerify = true): string[] {
  return [...runbook.primary, ...(includeVerify ? runbook.verify : [])]
    .map((step) => step.command)
    .filter((command): command is string => Boolean(command && command.trim()))
}

export function runbookCleanupCommands(runbook: Runbook): string[] {
  return runbook.cleanup
    .map((step) => step.command)
    .filter((command): command is string => Boolean(command && command.trim()))
}

export interface RunbookMeta {
  deviceLabel: string
  deviceHost?: string
  deviceTypeName: string
  generatedAt?: string
}

export function buildRunbookText(
  workflow: Workflow,
  values: Record<string, string>,
  runbook: Runbook,
  meta: RunbookMeta
): string {
  const lines: string[] = []
  const when = meta.generatedAt ?? new Date().toLocaleString()
  lines.push('# TSTerm troubleshooting runbook')
  lines.push(`# Device: ${meta.deviceLabel}${meta.deviceHost ? ` (${meta.deviceHost})` : ''}`)
  lines.push(`# Platform: ${meta.deviceTypeName}`)
  lines.push(`# Workflow: ${workflow.title}`)
  lines.push(`# Generated: ${when}`)
  lines.push('#')
  lines.push('# This is a documentation copy. Use "Copy commands" for paste-ready output.')
  if (workflow.severity !== 'info' || workflow.effect !== 'read') {
    lines.push(`# Effect: ${workflow.effect.toUpperCase()}    Severity: ${workflow.severity.toUpperCase()}`)
  }
  const masked = maskValues(workflow, values)
  const filled = Object.entries(masked).filter(([name, value]) => value && values[name] !== undefined)
  if (filled.length) {
    lines.push(`# Inputs: ${filled.map(([name, value]) => `${name}=${value}`).join(', ')}`)
  }
  if (workflow.requires.length) {
    lines.push(`# Requires: ${workflow.requires.join(', ')}`)
  }
  if (workflow.notes.length) {
    for (const note of workflow.notes) lines.push(`# Note: ${note}`)
  }
  lines.push(`# WARNING: ${effectWarning(workflow)}`)
  lines.push('')
  lines.push('# --- Commands -----------------------------------------------------------')
  for (const step of runbook.primary) {
    if (step.instruction) lines.push(`# DO: ${step.instruction}`)
    if (step.note) lines.push(`# ${step.note}`)
    if (step.command) lines.push(step.command)
    lines.push('')
  }
  if (runbook.verify.length) {
    lines.push('# --- Verify -------------------------------------------------------------')
    for (const step of runbook.verify) {
      if (step.instruction) lines.push(`# DO: ${step.instruction}`)
      if (step.note) lines.push(`# ${step.note}`)
      if (step.command) lines.push(step.command)
      lines.push('')
    }
  }
  if (runbook.cleanup.length) {
    lines.push('# --- Cleanup ------------------------------------------------------------')
    for (const step of runbook.cleanup) {
      if (step.instruction) lines.push(`# DO: ${step.instruction}`)
      if (step.note) lines.push(`# ${step.note}`)
      if (step.command) lines.push(step.command)
      lines.push('')
    }
  }
  return lines.join('\n').trimEnd() + '\n'
}

export function effectWarning(workflow: Workflow): string {
  switch (workflow.effect) {
    case 'debug':
      return 'Enables debugging. This can be CPU intensive. Cleanup commands are included below.'
    case 'capture':
      return 'Starts a packet capture. Cleanup commands are included below.'
    case 'change':
      return 'Changes device state. Review the commands and cleanup before running.'
    default:
      return 'Read-only commands. Review output for sensitive information before sharing.'
  }
}

export function effectLabel(effect: Workflow['effect']): string {
  return effect === 'read' ? 'Read only' : effect === 'debug' ? 'Debug' : effect === 'capture' ? 'Capture' : 'Changes state'
}

export function severityRank(severity: Workflow['severity']): number {
  return severity === 'danger' ? 2 : severity === 'caution' ? 1 : 0
}

/* ------------------------------------------------------- suggestion corpus */

export function tokenizeCommand(command: string): string[] {
  return command
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/^["']|["']$/g, ''))
    .filter(Boolean)
}

export function commandTokenSequences(workflow: Workflow): string[][] {
  return [...workflow.steps, ...workflow.verify]
    .map((step) => step.command)
    .filter((command): command is string => Boolean(command && command.trim()))
    .map(tokenizeCommand)
}

export function workflowSearchText(workflow: Workflow): string {
  return [
    workflow.title,
    workflow.summary,
    workflow.keywords.join(' '),
    workflow.tags.join(' '),
    workflow.id,
    ...workflow.steps.map((step) => step.command ?? ''),
    ...workflow.cleanup.map((step) => step.command ?? '')
  ]
    .join(' ')
    .toLowerCase()
}
