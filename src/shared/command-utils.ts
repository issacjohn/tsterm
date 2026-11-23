import type { AsaCommandRecord, CommandParameter, CommandRisk } from './types'

export interface RenderCommandResult {
  ok: boolean
  command?: string
  missing: string[]
  errors: string[]
}

export function extractPlaceholders(template: string): string[] {
  return [...new Set([...template.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]))]
}

export function validateParameter(parameter: CommandParameter, value: string): string | null {
  if (!value.trim()) return parameter.required ? `${parameter.name} is required.` : null
  if (/[\u0000-\u001f\u007f]/.test(value)) return `${parameter.name} contains control characters.`
  if (/[?]/.test(value)) return `${parameter.name} must not contain a help character.`
  if (!parameter.regex && /\s/.test(value)) {
    return `${parameter.name} must not contain spaces.`
  }
  if (parameter.regex) {
    try {
      if (!new RegExp(parameter.regex).test(value)) {
        return `${parameter.name} does not match the required format.`
      }
    } catch {
      return `${parameter.name} has an invalid validation rule.`
    }
  }
  return null
}

export function renderCommand(
  record: AsaCommandRecord,
  values: Record<string, string> = {}
): RenderCommandResult {
  const missing: string[] = []
  const errors: string[] = []
  const placeholders = extractPlaceholders(record.commandTemplate)
  let command = record.commandTemplate

  for (const name of placeholders) {
    const parameter =
      record.parameters.find((item) => item.name === name) ??
      ({ name, required: true } as CommandParameter)
    const value = (values[name] ?? parameter.default ?? '').trim()
    if (!value) {
      if (parameter.required) missing.push(name)
      command = command.replaceAll(`{${name}}`, '')
      continue
    }
    const error = validateParameter(parameter, value)
    if (error) errors.push(error)
    command = command.replaceAll(`{${name}}`, value)
  }

  command = command.replace(/\s+/g, ' ').trim()
  if (command.includes('{') || command.includes('}')) {
    errors.push('The command still contains an unresolved placeholder.')
  }
  if (/[\r\n]/.test(command)) errors.push('The command contains a line break.')
  if (command.length > 4096) errors.push('The command is too long.')

  return {
    ok: missing.length === 0 && errors.length === 0,
    command: command || undefined,
    missing,
    errors
  }
}

export function riskLabel(risk: CommandRisk): string {
  if (risk === 'read_only') return 'Read only'
  if (risk === 'diagnostic') return 'Diagnostic'
  if (risk === 'destructive') return 'Destructive'
  return 'Mutating'
}

export function riskRank(risk: CommandRisk): number {
  if (risk === 'read_only') return 0
  if (risk === 'diagnostic') return 1
  if (risk === 'mutating') return 2
  return 3
}
