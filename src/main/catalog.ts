import fs from 'node:fs'
import path from 'node:path'
import type {
  CatalogBundle,
  CatalogIssue,
  CatalogSaveResult,
  Category,
  ChoiceValue,
  Condition,
  DeviceType,
  Severity,
  VariableType,
  Workflow,
  WorkflowEffect,
  WorkflowReference,
  WorkflowStep,
  WorkflowVariable
} from '@shared/types'

type Raw = Record<string, unknown>
type RawEntry = { raw: Raw; source: string }
type SourceKind = 'bundled' | 'custom'

const SLUG = /^[a-z0-9][a-z0-9-]*$/
const VAR_NAME = /^[a-z][a-z0-9_]*$/
const VARIABLE_TYPES: VariableType[] = [
  'string',
  'ip',
  'ipv4',
  'ipv6',
  'int',
  'port',
  'choice',
  'interface',
  'mac',
  'hostname'
]
const EFFECTS: WorkflowEffect[] = ['read', 'debug', 'capture', 'change']
const SEVERITIES: Severity[] = ['info', 'caution', 'danger']

function isObject(value: unknown): value is Raw {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asStringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function findPlaceholders(text: string): string[] {
  const names = new Set<string>()
  const regex = /(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)\}(?!\})/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text))) names.add(match[1])
  return [...names]
}

function mergeById(parentValue: unknown, childValue: unknown): Raw[] {
  const merged = new Map<string, Raw>()
  for (const item of [...asArray(parentValue), ...asArray(childValue)]) {
    if (!isObject(item)) continue
    const id = asString(item.id)
    if (!id) continue
    merged.set(id, item)
  }
  return [...merged.values()].map((item) => clone(item))
}

function mergeRaw(parent: Raw, child: Raw): Raw {
  const result: Raw = { ...clone(parent), ...clone(child) }
  result.aliases = unique([...asStringArray(parent.aliases), ...asStringArray(child.aliases)])
  result.notes = unique([...asStringArray(parent.notes), ...asStringArray(child.notes)])
  result.categories = mergeById(parent.categories, child.categories)
  result.workflows = mergeById(parent.workflows, child.workflows)
  const remove = new Set(asStringArray(child.removeWorkflows))
  if (remove.size) {
    result.workflows = (result.workflows as Raw[]).filter((workflow) => !remove.has(asString(workflow.id)))
  }
  delete result.removeWorkflows
  return result
}

class TypeContext {
  readonly errors: string[] = []
  readonly warnings: string[] = []
  readonly issues: CatalogIssue[] = []

  constructor(
    readonly typeId: string,
    readonly source: string
  ) {}

  error(message: string, workflowId?: string): void {
    this.errors.push(message)
    this.issues.push({ severity: 'error', message, source: this.source, typeId: this.typeId, workflowId })
  }

  warn(message: string, workflowId?: string): void {
    this.warnings.push(message)
    this.issues.push({ severity: 'warning', message, source: this.source, typeId: this.typeId, workflowId })
  }
}

function parseVariable(raw: unknown, ctx: TypeContext, workflowId: string): WorkflowVariable | null {
  if (!isObject(raw)) {
    ctx.error('A variable entry must be an object.', workflowId)
    return null
  }
  const name = asString(raw.name).trim()
  if (!VAR_NAME.test(name)) {
    ctx.error(`Invalid variable name "${name || '(missing)'}" (use lowercase letters, numbers and underscores).`, workflowId)
    return null
  }
  const choicesRaw = asArray(raw.choices)
  let type = asString(raw.type, choicesRaw.length ? 'choice' : 'string') as VariableType
  if (!VARIABLE_TYPES.includes(type)) {
    ctx.error(`Variable "${name}" has unsupported type "${type}".`, workflowId)
    return null
  }
  if (choicesRaw.length && type !== 'choice') type = 'choice'
  const choices: ChoiceValue[] = []
  for (const choice of choicesRaw) {
    if (typeof choice === 'string') {
      choices.push({ value: choice, label: choice })
    } else if (isObject(choice) && typeof choice.value === 'string') {
      choices.push({
        value: choice.value,
        label: asString(choice.label, choice.value),
        description: asString(choice.description) || undefined
      })
    } else {
      ctx.error(`Variable "${name}" has an invalid choice.`, workflowId)
    }
  }
  if (type === 'choice' && choices.length === 0) {
    ctx.error(`Variable "${name}" is a choice but has no choices.`, workflowId)
    return null
  }
  const choiceValues = new Set(choices.map((choice) => choice.value))
  if (new Set(choices.map((choice) => choice.value)).size !== choices.length) {
    ctx.error(`Variable "${name}" has duplicate choice values.`, workflowId)
  }
  let defaultValue = raw.default === undefined ? '' : String(raw.default)
  if (type === 'choice' && defaultValue && !choiceValues.has(defaultValue)) {
    ctx.error(`Variable "${name}" default "${defaultValue}" is not one of its choices.`, workflowId)
  }
  if ((type === 'int' || type === 'port') && defaultValue && !/^-?\d+$/.test(defaultValue)) {
    ctx.error(`Variable "${name}" default must be a number.`, workflowId)
  }
  if (type === 'port' && defaultValue) {
    const port = Number(defaultValue)
    if (port < 1 || port > 65535) ctx.error(`Variable "${name}" default port is out of range.`, workflowId)
  }
  let pattern: string | undefined
  if (raw.pattern !== undefined) {
    pattern = asString(raw.pattern)
    try {
      new RegExp(pattern)
    } catch {
      ctx.error(`Variable "${name}" has an invalid regex pattern.`, workflowId)
    }
  }
  const min = typeof raw.min === 'number' ? raw.min : undefined
  const max = typeof raw.max === 'number' ? raw.max : undefined
  return {
    name,
    prompt: asString(raw.prompt, name),
    type,
    required: asBoolean(raw.required, true),
    default: defaultValue,
    help: asString(raw.help) || undefined,
    placeholder: asString(raw.placeholder) || undefined,
    choices,
    pattern,
    sensitive: asBoolean(raw.sensitive, false),
    min,
    max
  }
}

function parseCondition(raw: unknown, variables: WorkflowVariable[], ctx: TypeContext, workflowId: string): Condition | null {
  if (!isObject(raw)) {
    ctx.error('A condition must be an object.', workflowId)
    return null
  }
  const variable = asString(raw.var).trim()
  if (!variable) {
    ctx.error('A condition requires a variable name.', workflowId)
    return null
  }
  if (!variables.some((item) => item.name === variable)) {
    ctx.error(`Condition references unknown variable "${variable}".`, workflowId)
    return null
  }
  const condition: Condition = { var: variable }
  if (typeof raw.equals === 'string') condition.equals = raw.equals
  if (typeof raw.notEquals === 'string') condition.notEquals = raw.notEquals
  if (typeof raw.notEmpty === 'boolean') condition.notEmpty = raw.notEmpty
  if (typeof raw.empty === 'boolean') condition.empty = raw.empty
  if (
    condition.equals === undefined &&
    condition.notEquals === undefined &&
    condition.notEmpty === undefined &&
    condition.empty === undefined
  ) {
    ctx.error(`Condition for "${variable}" needs equals, notEquals, notEmpty or empty.`, workflowId)
    return null
  }
  return condition
}

function parseStep(
  raw: unknown,
  variables: WorkflowVariable[],
  usedVariables: Set<string>,
  ctx: TypeContext,
  workflowId: string,
  section: 'steps' | 'verify' | 'cleanup'
): WorkflowStep | null {
  let command = ''
  let instruction = ''
  let note = ''
  let when: Condition | null = null
  let unless: Condition | null = null

  if (typeof raw === 'string') {
    command = raw
  } else if (isObject(raw)) {
    command = asString(raw.command)
    instruction = asString(raw.instruction)
    note = asString(raw.note)
    if (raw.when !== undefined) when = parseCondition(raw.when, variables, ctx, workflowId)
    if (raw.unless !== undefined) unless = parseCondition(raw.unless, variables, ctx, workflowId)
  } else {
    ctx.error(`A ${section} entry must be a string or an object.`, workflowId)
    return null
  }

  if (!command.trim() && !instruction.trim()) {
    ctx.error(`A ${section} entry needs a command or an instruction.`, workflowId)
    return null
  }

  const texts = [command, instruction].filter(Boolean)
  for (const text of texts) {
    for (const placeholder of findPlaceholders(text)) {
      const variable = variables.find((item) => item.name === placeholder)
      if (!variable) {
        ctx.error(`Unknown placeholder "{${placeholder}}" in ${section}.`, workflowId)
      } else {
        usedVariables.add(placeholder)
        if (!variable.required && !when && !unless) {
          ctx.warn(
            `Optional variable "${placeholder}" is used in a ${section} command without a when/unless condition; it will render empty.`,
            workflowId
          )
        }
      }
    }
  }
  return {
    command: command.trim() ? command : undefined,
    instruction: instruction.trim() ? instruction : undefined,
    note: note.trim() ? note : undefined,
    when: when ?? undefined,
    unless: unless ?? undefined
  }
}

function parseWorkflow(raw: unknown, ctx: TypeContext, categories: Set<string>): Workflow | null {
  if (!isObject(raw)) {
    ctx.error('A workflow must be an object.')
    return null
  }
  const id = asString(raw.id).trim()
  if (!SLUG.test(id)) {
    ctx.error(`Invalid workflow id "${id || '(missing)'}".`)
    return null
  }
  const category = asString(raw.category).trim()
  if (!category) {
    ctx.error(`Workflow "${id}" needs a category.`, id)
    return null
  }
  if (!categories.has(category)) {
    ctx.error(`Workflow "${id}" references unknown category "${category}".`, id)
    return null
  }
  const variables: WorkflowVariable[] = []
  for (const item of asArray(raw.variables)) {
    const variable = parseVariable(item, ctx, id)
    if (variable) {
      if (variables.some((existing) => existing.name === variable.name)) {
        ctx.error(`Duplicate variable "${variable.name}".`, id)
      } else {
        variables.push(variable)
      }
    }
  }

  const usedVariables = new Set<string>()
  const steps: WorkflowStep[] = []
  for (const item of asArray(raw.steps)) {
    const step = parseStep(item, variables, usedVariables, ctx, id, 'steps')
    if (step) steps.push(step)
  }
  const verify: WorkflowStep[] = []
  for (const item of asArray(raw.verify)) {
    const step = parseStep(item, variables, usedVariables, ctx, id, 'verify')
    if (step) verify.push(step)
  }
  const cleanup: WorkflowStep[] = []
  for (const item of asArray(raw.cleanup)) {
    const step = parseStep(item, variables, usedVariables, ctx, id, 'cleanup')
    if (step) cleanup.push(step)
  }

  if (steps.length === 0) ctx.error(`Workflow "${id}" has no steps.`, id)

  const effect = (asString(raw.effect, 'read') as WorkflowEffect) || 'read'
  if (!EFFECTS.includes(effect)) {
    ctx.error(`Workflow "${id}" has unsupported effect "${effect}".`, id)
    return null
  }
  if ((effect === 'debug' || effect === 'capture') && !cleanup.some((step) => step.command)) {
    ctx.error(`Workflow "${id}" is a ${effect} workflow and must define cleanup commands.`, id)
  }

  const severity = (asString(raw.severity, 'info') as Severity) || 'info'
  if (!SEVERITIES.includes(severity)) {
    ctx.error(`Workflow "${id}" has unsupported severity "${severity}".`, id)
    return null
  }

  for (const variable of variables) {
    if (!usedVariables.has(variable.name)) {
      const referencedInCondition = [...steps, ...verify, ...cleanup].some((step) => {
        const conditions = [step.when, step.unless].filter(Boolean) as Condition[]
        return conditions.some((condition) => condition.var === variable.name)
      })
      if (!referencedInCondition) {
        ctx.warn(`Variable "${variable.name}" is declared but never used.`, id)
      }
    }
  }

  const references: WorkflowReference[] = []
  for (const item of asArray(raw.references)) {
    if (isObject(item) && typeof item.url === 'string') {
      references.push({ title: asString(item.title, String(item.url)), url: item.url })
    }
  }

  return {
    id,
    title: asString(raw.title, id),
    category,
    summary: asString(raw.summary),
    keywords: unique(asStringArray(raw.keywords)),
    tags: unique(asStringArray(raw.tags)),
    severity,
    effect,
    requires: unique(asStringArray(raw.requires)),
    notes: unique(asStringArray(raw.notes)),
    variables,
    steps,
    verify,
    cleanup,
    references
  }
}

function parseDeviceType(
  raw: Raw,
  source: string,
  sourceKind: SourceKind
): { device: DeviceType | null; issues: CatalogIssue[] } {
  const id = asString(raw.id).trim()
  const hold = new TypeContext(id || '(unknown)', source)
  if (!SLUG.test(id)) {
    hold.error(`Invalid device type id "${id || '(missing)'}".`)
    return { device: null, issues: hold.issues }
  }
  const categories: Category[] = []
  for (const item of asArray(raw.categories)) {
    if (!isObject(item)) {
      hold.error('A category must be an object.')
      continue
    }
    const categoryId = asString(item.id).trim()
    if (!SLUG.test(categoryId)) {
      hold.error(`Invalid category id "${categoryId || '(missing)'}".`)
      continue
    }
    if (categories.some((category) => category.id === categoryId)) {
      hold.error(`Duplicate category "${categoryId}".`)
      continue
    }
    categories.push({
      id: categoryId,
      name: asString(item.name, categoryId),
      description: asString(item.description) || undefined
    })
  }
  const categoryIds = new Set(categories.map((category) => category.id))
  const workflows: Workflow[] = []
  for (const item of asArray(raw.workflows)) {
    const workflow = parseWorkflow(item, hold, categoryIds)
    if (workflow) {
      if (workflows.some((existing) => existing.id === workflow.id)) {
        hold.error(`Duplicate workflow "${workflow.id}".`, workflow.id)
      } else {
        workflows.push(workflow)
      }
    }
  }
  if (workflows.length === 0) hold.warn('This device type has no valid workflows.')

  if (hold.errors.length) {
    return { device: null, issues: hold.issues }
  }
  return {
    device: {
      id,
      name: asString(raw.name, id),
      vendor: asString(raw.vendor, 'Custom'),
      family: asString(raw.family, 'Other'),
      description: asString(raw.description),
      aliases: unique(asStringArray(raw.aliases)),
      notes: unique(asStringArray(raw.notes)),
      categories,
      workflows,
      source: sourceKind,
      extends: asString(raw.extends) || undefined
    },
    issues: hold.issues
  }
}

export class CatalogService {
  private bundle: CatalogBundle = { types: [], issues: [], loadedAt: new Date().toISOString() }
  private readonly bundledDir: string
  private readonly customDir: string
  private bundledIds = new Set<string>()

  constructor(bundledDir: string, customDir: string) {
    this.bundledDir = bundledDir
    this.customDir = customDir
    fs.mkdirSync(customDir, { recursive: true })
  }

  get(): CatalogBundle {
    return this.bundle
  }

  load(): CatalogBundle {
    const issues: CatalogIssue[] = []
    const entries = new Map<string, RawEntry>()
    this.bundledIds = new Set()

    const readFolder = (folder: string, kind: SourceKind): void => {
      if (!fs.existsSync(folder)) return
      for (const file of fs.readdirSync(folder).sort()) {
        if (!file.toLowerCase().endsWith('.json')) continue
        if (file.startsWith('_')) continue
        const fullPath = path.join(folder, file)
        try {
          const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, ''))
          const list = Array.isArray(raw) ? raw : [raw]
          for (const item of list) {
            if (!isObject(item)) {
              issues.push({ severity: 'error', message: 'Device pack must contain an object.', source: fullPath })
              continue
            }
            const id = asString(item.id).trim()
            if (!SLUG.test(id)) {
              issues.push({
                severity: 'error',
                message: `Device pack has an invalid id "${id || '(missing)'}".`,
                source: fullPath
              })
              continue
            }
            if (kind === 'bundled') this.bundledIds.add(id)
            if (entries.has(id) && kind === 'custom') {
              issues.push({
                severity: 'warning',
                message: `Custom device pack "${id}" overrides an earlier definition.`,
                source: fullPath,
                typeId: id
              })
            }
            entries.set(id, { raw: item, source: fullPath })
          }
        } catch (error) {
          issues.push({
            severity: 'error',
            message: `Could not parse JSON: ${(error as Error).message}`,
            source: fullPath
          })
        }
      }
    }

    readFolder(this.bundledDir, 'bundled')
    readFolder(this.customDir, 'custom')

    const resolved = new Map<string, { raw: Raw; source: string; sourceKind: SourceKind }>()
    const resolving = new Set<string>()

    const resolve = (id: string): { raw: Raw; source: string; sourceKind: SourceKind } | null => {
      if (resolved.has(id)) return resolved.get(id)!
      const entry = entries.get(id)
      if (!entry) return null
      if (resolving.has(id)) {
        issues.push({
          severity: 'error',
          message: `Inheritance cycle involving "${id}".`,
          source: entry.source,
          typeId: id
        })
        return null
      }
      resolving.add(id)
      const sourceKind: SourceKind = entry.source.startsWith(this.customDir) ? 'custom' : 'bundled'
      const parentId = asString(entry.raw.extends).trim()
      let raw = clone(entry.raw)
      if (parentId) {
        if (parentId === id) {
          issues.push({
            severity: 'error',
            message: `Device type "${id}" cannot extend itself.`,
            source: entry.source,
            typeId: id
          })
          resolving.delete(id)
          return null
        }
        const parent = resolve(parentId)
        if (!parent) {
          issues.push({
            severity: 'error',
            message: `Device type "${id}" extends unknown type "${parentId}".`,
            source: entry.source,
            typeId: id
          })
          resolving.delete(id)
          return null
        }
        raw = mergeRaw(parent.raw, entry.raw)
      }
      const result = { raw, source: entry.source, sourceKind }
      resolved.set(id, result)
      resolving.delete(id)
      return result
    }

    const types: DeviceType[] = []
    for (const id of [...entries.keys()].sort()) {
      const target = resolve(id)
      if (!target) continue
      try {
        const result = parseDeviceType(target.raw, target.source, target.sourceKind)
        issues.push(...result.issues)
        if (result.device) types.push(result.device)
      } catch (error) {
        issues.push({
          severity: 'error',
          message: (error as Error).message,
          source: target.source,
          typeId: id
        })
      }
    }

    types.sort((a, b) => `${a.vendor} ${a.name}`.localeCompare(`${b.vendor} ${b.name}`))
    const dedupedIssues = issues.filter(
      (issue, index, list) =>
        list.findIndex(
          (candidate) =>
            candidate.severity === issue.severity &&
            candidate.message === issue.message &&
            candidate.source === issue.source &&
            candidate.workflowId === issue.workflowId
        ) === index
    )
    this.bundle = { types, issues: dedupedIssues, loadedAt: new Date().toISOString() }
    return this.bundle
  }

  saveCustom(jsonText: string): CatalogSaveResult {
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText.replace(/^\uFEFF/, ''))
    } catch (error) {
      return { ok: false, errors: [`Invalid JSON: ${(error as Error).message}`] }
    }
    const list = Array.isArray(parsed) ? parsed : [parsed]
    const paths: string[] = []
    const errors: string[] = []
    for (const item of list) {
      if (!isObject(item)) {
        errors.push('A device pack must be a JSON object.')
        continue
      }
      const id = asString(item.id).trim()
      if (!SLUG.test(id)) {
        errors.push(`Invalid device pack id "${id || '(missing)'}".`)
        continue
      }
      const file = path.join(this.customDir, `${id}.json`)
      const isEditingCustom = fs.existsSync(file)
      if (this.bundledIds.has(id) && !isEditingCustom) {
        errors.push(
          `"${id}" is a bundled device type. Choose a new id and use "extends": "${id}" if you want to build on it.`
        )
        continue
      }
      if (this.bundledIds.size === 0) this.load() // make sure bundled id protection is populated
      if (this.bundledIds.has(id) && !isEditingCustom) {
        errors.push(
          `"${id}" is a bundled device type. Choose a new id and use "extends": "${id}" if you want to build on it.`
        )
        continue
      }
      const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
      try {
        fs.writeFileSync(file, JSON.stringify(item, null, 2), 'utf8')
        const bundle = this.load()
        const fileErrors = bundle.issues.filter(
          (issue) => issue.severity === 'error' && issue.source === file
        )
        if (fileErrors.length) {
          if (previous === null) fs.unlinkSync(file)
          else fs.writeFileSync(file, previous, 'utf8')
          this.load()
          errors.push(...fileErrors.map((issue) => issue.message))
          continue
        }
        paths.push(file)
      } catch (error) {
        errors.push((error as Error).message)
        try {
          if (previous === null) fs.unlinkSync(file)
          else fs.writeFileSync(file, previous, 'utf8')
          this.load()
        } catch {
          // best effort
        }
      }
    }
    if (errors.length) {
      return { ok: false, errors, bundle: this.bundle, path: paths[0] }
    }
    return { ok: true, bundle: this.bundle, path: paths[0] }
  }

  deleteCustom(id: string): CatalogBundle {
    if (!SLUG.test(id)) throw new Error('Invalid device type id.')
    const file = path.join(this.customDir, `${id}.json`)
    if (fs.existsSync(file)) fs.unlinkSync(file)
    return this.load()
  }

  importCustom(sourceFile: string): CatalogSaveResult {
    const text = fs.readFileSync(sourceFile, 'utf8')
    return this.saveCustom(text)
  }

  template(): string {
    const example = {
      id: 'custom-device',
      name: 'Custom device',
      vendor: 'Custom',
      family: 'Other',
      description: 'Starter device pack. Edit the commands for your platform.',
      aliases: ['custom'],
      notes: ['Replace the starter commands with commands that are valid on this platform.'],
      categories: [
        { id: 'connectivity', name: 'Connectivity', description: 'Reachability and path checks.' },
        { id: 'evidence', name: 'Evidence', description: 'Collect logs and configuration.' }
      ],
      workflows: [
        {
          id: 'reachability',
          title: 'Reachability check',
          category: 'connectivity',
          summary: 'Ping and trace the path to a target, then check the route.',
          keywords: ['ping', 'traceroute', 'route', 'connectivity'],
          tags: ['connectivity'],
          severity: 'info',
          effect: 'read',
          requires: ['CLI access'],
          variables: [
            {
              name: 'target',
              prompt: 'Target IP or hostname',
              type: 'hostname',
              default: '',
              required: true,
              placeholder: '8.8.8.8'
            }
          ],
          steps: [
            { command: 'ping {target}', note: 'Stop after 4 replies if the platform needs a count flag.' },
            { command: 'traceroute {target}' },
            { command: 'show route {target}', note: 'Replace with the route lookup command for this platform.' }
          ],
          notes: ['If your platform uses different flags, edit this workflow.']
        },
        {
          id: 'collect-evidence',
          title: 'Collect evidence',
          category: 'evidence',
          summary: 'Collect version, logs and running configuration.',
          keywords: ['logs', 'version', 'config', 'evidence'],
          tags: ['evidence'],
          severity: 'caution',
          effect: 'read',
          steps: [
            { command: 'show version' },
            { command: 'show logging' },
            { command: 'show running-config', note: 'Check your policy before copying configuration off the device.' }
          ]
        }
      ]
    }
    return JSON.stringify(example, null, 2)
  }
}
