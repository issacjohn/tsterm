import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const pack = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'resources/catalog/cisco-asa.json'), 'utf8')
)
const indexSource = fs.readFileSync(path.join(ROOT, 'src/shared/asa-commands.ts'), 'utf8')

const topLevel = []
const pattern = /name: '([^']+)', description: '([^']+)'(?:, example: '([^']+)')?/g
let match
while ((match = pattern.exec(indexSource)) !== null) {
  topLevel.push({ name: match[1], description: match[2], example: match[3] })
}

function commandFromStep(step) {
  return typeof step === 'string' ? step : step?.command
}

function riskForTopLevel(name) {
  if (/^(reload|erase|format|downgrade|restore|revert|delete|fsck|fips)$/i.test(name)) return 'destructive'
  if (/^(debug|undebug|capture|packet-tracer|terminal|test|perfmon|cpu|memory|call-home)$/i.test(name)) return 'diagnostic'
  if (/^(show|ping|traceroute|dir|more|help|who|pwd|cd|exit|quit|logout|disable|verify)$/i.test(name)) {
    return 'read_only'
  }
  return 'mutating'
}

const INTENT_ALIASES = {
  show: 'display check view inspect',
  write: 'save persist backup store',
  copy: 'save backup transfer',
  reload: 'reboot restart power-cycle',
  erase: 'wipe delete clear',
  clear: 'reset flush',
  capture: 'pcap sniff tcpdump packet',
  debug: 'trace troubleshoot verbose',
  'packet-tracer': 'simulate path test flow',
  ping: 'reachability icmp',
  traceroute: 'path hops',
  'show-tech': 'support bundle diagnostics'
}

function aliasesFor(name) {
  return INTENT_ALIASES[name] ? [INTENT_ALIASES[name]] : []
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
}

function riskForText(command) {
  const lower = command.trim().toLowerCase().replace(/\s+/g, ' ')
  if (/^(reload|erase|format|delete|downgrade|fsck|fips)\b/.test(lower)) return 'destructive'
  if (/^write\s+erase\b/.test(lower)) return 'destructive'
  if (/^clear\s+configure\b/.test(lower) && !/^clear\s+configure\s+access-list\b/.test(lower)) {
    return 'destructive'
  }
  if (
    /^(debug|undebug|capture|no\s+capture|packet-tracer|perfmon|terminal\s+(monitor|no\s+monitor)|test)\b/.test(
      lower
    )
  ) {
    return 'diagnostic'
  }
  if (/^(show|ping|traceroute|dir|more|verify|help|who|pwd|exit|quit|logout|disable)\b/.test(lower)) {
    return 'read_only'
  }
  if (/^clear\s+configure\s+access-list\b/.test(lower)) return 'mutating'
  if (
    /^(configure|access-list|no\s+|clear|write|copy|rename|mkdir|rmdir|clock|logging|hostname|interface|route|object|nat|crypto|aaa|user-identity|ssh|telnet|http|snmp|ntp|dns|dhcpd)\b/.test(
      lower
    )
  ) {
    return 'mutating'
  }
  return null
}

function riskForCommand(workflow, command) {
  const known = riskForText(command)
  if (known) return known
  if (workflow.effect === 'change') return 'mutating'
  if (workflow.effect === 'debug' || workflow.effect === 'capture') return 'diagnostic'
  return 'read_only'
}

function regexForVariable(variable, name) {
  if (!variable) return '^[^\\s\\r\\n;|&`<>?]+$'
  if (variable.type === 'ip') {
    return '^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)$'
  }
  if (variable.type === 'interface') return '^[A-Za-z][A-Za-z0-9/_.:-]*$'
  if (variable.type === 'port') {
    return '^(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$'
  }
  if (variable.type === 'number') return '^\\d{1,6}$'
  if (variable.type === 'choice' && variable.choices?.length) {
    const values = variable.choices.map((choice) =>
      typeof choice === 'string' ? choice : choice.value
    )
    return `^(${values.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`
  }
  if (variable.type === 'mac') return '^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$'
  if (variable.type === 'fqdn') return '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$'
  if (variable.sensitive) return '^[^\\s\\r\\n;|&`<>?]+$'
  return '^[^\\s\\r\\n;|&`<>?]+$'
}

function parametersFor(command, workflow) {
  const variables = new Map((workflow.variables ?? []).map((variable) => [variable.name, variable]))
  const names = [...new Set([...command.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((item) => item[1]))]
  return names.map((name) => {
    const variable = variables.get(name)
    const firstChoice = variable?.choices?.[0]
    const defaultValue =
      variable?.default ||
      (variable?.type === 'choice' && firstChoice
        ? typeof firstChoice === 'string'
          ? firstChoice
          : firstChoice.value
        : undefined)
    return {
      name,
      required: defaultValue ? false : variable?.required !== false,
      regex: regexForVariable(variable, name),
      description: variable?.prompt || name.replace(/_/g, ' '),
      default: defaultValue,
      placeholder: variable?.placeholder || defaultValue
    }
  })
}

function keywordsFor(value, extra = []) {
  return [
    ...new Set(
      `${value} ${extra.join(' ')}`
        .toLowerCase()
        .match(/[a-z0-9%_.:/-]+/g)
        ?.filter((token) => token.length > 1) ?? []
    )
  ].slice(0, 60)
}

const commands = []

for (const command of topLevel) {
  const example = command.example && !command.example.endsWith('?') ? command.example : undefined
  const aliases = aliasesFor(command.name)
  commands.push({
    id: `asa.cmd.${command.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    vendor: 'cisco-asa',
    commandTemplate: command.name,
    description: command.description,
    category: 'exec',
    mode: 'EXEC / config',
    risk: riskForTopLevel(command.name),
    keywords: keywordsFor(`${command.name} ${command.description}`, [
      ...aliases,
      ...(example ? [example] : [])
    ]),
    parameters: [],
    examples: example ? [example] : [],
    cleanup: [],
    source: 'asa-help',
    version: '9.24'
  })

  // Some top-level help entries include a complete example. Keep it as its own
  // fillable record instead of hiding a usable command in an example field.
  if (example && example !== command.name) {
    commands.push({
      id: `asa.example.${slugify(example)}`,
      vendor: 'cisco-asa',
      commandTemplate: example,
      description: `${command.description} Example: ${example}`,
      category: 'exec',
      mode: 'EXEC / config',
      risk: riskForText(example) ?? riskForTopLevel(command.name),
      keywords: keywordsFor(`${command.name} ${command.description} ${example}`, aliases),
      parameters: [],
      examples: [example],
      cleanup: [],
      source: 'asa-help',
      version: '9.24'
    })
  }
}

for (const workflow of pack.workflows ?? []) {
  const allSteps = [...(workflow.steps ?? []), ...(workflow.verify ?? []), ...(workflow.cleanup ?? [])]
  allSteps.forEach((step, index) => {
    const command = commandFromStep(step)
    if (!command) return
    const cleanup = (workflow.cleanup ?? []).map(commandFromStep).filter(Boolean)
    const primary = index === 0
    commands.push({
      id: `asa.rb.${workflow.id}.${index}`,
      vendor: 'cisco-asa',
      commandTemplate: command,
      // The workflow summary describes the whole recipe. Repeating it on every
      // support step makes buffer/show/cleanup steps rank like the recipe's
      // primary command. Keep the summary on the first step only.
      description: primary
        ? `${workflow.title}: ${workflow.summary}`
        : `${workflow.title}: ${command}`,
      category: workflow.category,
      mode: 'privileged EXEC',
      risk: riskForCommand(workflow, command),
      keywords: keywordsFor(
        `${workflow.title} ${primary ? workflow.summary : ''} ${command}`,
        [
          ...aliasesFor(command.split(/\s+/)[0].toLowerCase()),
          ...(workflow.keywords ?? []),
          ...(workflow.tags ?? []),
          workflow.category
        ]
      ),
      parameters: parametersFor(command, workflow),
      examples: [],
      cleanup: workflow.effect === 'debug' || workflow.effect === 'capture' ? cleanup : [],
      source: 'runbook',
      version: '9.24'
    })
  })
}

const output = {
  version: 1,
  vendor: 'cisco-asa',
  generatedAt: new Date().toISOString(),
  commands
}

const outDir = path.join(ROOT, 'resources/commands')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'asa-commands.json'), JSON.stringify(output, null, 2), 'utf8')

const examples = commands.filter((command) => command.id.startsWith('asa.example.')).length
console.log(`Wrote ${commands.length} ASA command records to resources/commands/asa-commands.json`)
console.log(
  `Top-level: ${topLevel.length}, examples: ${examples}, runbook steps: ${
    commands.length - topLevel.length - examples
  }`
)
