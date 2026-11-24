import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const CATALOG_DIR = path.join(ROOT, 'resources', 'catalog')
const OUT = path.join(ROOT, 'resources', 'commands', 'device-commands.json')

const RISKS = new Set(['read_only', 'diagnostic', 'mutating', 'destructive'])

function slug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function commandFromStep(step) {
  if (typeof step === 'string') return step.trim()
  if (step && typeof step === 'object' && typeof step.command === 'string') return step.command.trim()
  return ''
}

function regexForVariable(variable, name) {
  if (!variable) return '^[^\\s\\r\\n;|&`<>?]+$'
  if (variable.type === 'ip' || variable.type === 'ipv4') {
    return '^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)$'
  }
  if (variable.type === 'ipv6') return '^[0-9A-Fa-f:.]+$'
  if (variable.type === 'interface') return '^[A-Za-z][A-Za-z0-9/_.:-]*$'
  if (variable.type === 'port') {
    return '^(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$'
  }
  if (variable.type === 'int') return '^\\d{1,9}$'
  if (variable.type === 'number') return '^\\d{1,9}$'
  if (variable.type === 'mac') return '^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$'
  if (variable.type === 'hostname' || variable.type === 'fqdn') {
    return '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$'
  }
  if (variable.type === 'email') return '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'
  if (variable.type === 'url') return '^[A-Za-z][A-Za-z0-9+.-]*://[^\\s]+$'
  if (variable.type === 'choice' && Array.isArray(variable.choices) && variable.choices.length) {
    const values = variable.choices.map((choice) =>
      typeof choice === 'string' ? choice : choice?.value
    )
    return `^(${values
      .filter(Boolean)
      .map((value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|')})$`
  }
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

function riskFor(workflow, command) {
  const lower = command.toLowerCase()
  if (
    /^(reload|erase|format|wipe|delete|remove-|remove\s|uninstall|destroy|shutdown\s|write\s+erase|clear\s+configure)\b/.test(
      lower
    )
  ) {
    return 'destructive'
  }
  if (
    /^(debug|undebug|no\s+debug|monitor\s+capture|pktmon\s+(start|stop|filter)|tcpdump|tshark|perfmon|packet-tracer|test-|test\s)/.test(
      lower
    )
  ) {
    return 'diagnostic'
  }
  if (
    /^(show|display|get-|ipconfig|ifconfig|ping|traceroute|tracert|nslookup|dig|resolve-dnsname|netstat|ss|arp|route|print|systeminfo|df|free|top|ps|cat|type|dir|ls|more|whoami|hostname|uname|sw_vers|ip\s|netsh\s+interface|netsh\s+wlan|log\s+show|journalctl|systemctl\s+status|sc\s+query|tasklist|wmic)\b/.test(
      lower
    )
  ) {
    return 'read_only'
  }
  if (workflow.effect === 'read') return 'read_only'
  if (workflow.effect === 'debug' || workflow.effect === 'capture') return 'diagnostic'
  if (workflow.effect === 'change') return 'mutating'
  return 'mutating'
}

function keywordsFor(value, extra) {
  return [
    ...new Set(
      `${value} ${extra.join(' ')}`
        .toLowerCase()
        .match(/[a-z0-9%_.:/-]+/g)
        ?.filter((token) => token.length > 1) ?? []
    )
  ].slice(0, 70)
}

const files = fs
  .readdirSync(CATALOG_DIR)
  .filter((file) => file.toLowerCase().endsWith('.json') && !file.startsWith('_'))
  .sort()

const records = []
let workflows = 0
let commands = 0

for (const file of files) {
  const type = JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, file), 'utf8'))
  if (!type || typeof type !== 'object' || !type.id || type.id === 'cisco-asa') continue
  const categories = new Map((type.categories ?? []).map((category) => [category.id, category]))
  workflows += (type.workflows ?? []).length
  for (const workflow of type.workflows ?? []) {
    const steps = [...(workflow.steps ?? []), ...(workflow.verify ?? [])]
    const cleanup = (workflow.cleanup ?? []).map(commandFromStep).filter(Boolean)
    const category = categories.get(workflow.category)
    steps.forEach((step, index) => {
      const command = commandFromStep(step)
      if (!command) return
      if (/[\u0000-\u001f]/.test(command)) return
      commands += 1
      const risk = riskFor(workflow, command)
      records.push({
        id: `dev.${slug(type.id)}.${slug(workflow.id)}.${index}`,
        vendor: type.vendor || type.id,
        deviceTypeId: type.id,
        commandTemplate: command,
        description: `${workflow.title}: ${command}`,
        category: category?.name || workflow.category || type.family || 'Device pack',
        mode: 'runbook',
        risk,
        keywords: keywordsFor(
          `${type.name} ${type.vendor} ${type.family} ${workflow.title} ${workflow.summary} ${command}`,
          [...(workflow.keywords ?? []), ...(workflow.tags ?? []), category?.name || '']
        ),
        parameters: parametersFor(command, workflow),
        examples: [],
        cleanup,
        source: 'runbook',
        version: 'device-pack',
        syntax: command,
        referenceOnly: false
      })
    })
  }
}

const byId = new Map(records.map((record) => [record.id, record]))
const output = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: 'resources/catalog',
  commands: [...byId.values()]
}
fs.writeFileSync(OUT, JSON.stringify(output, null, 2), 'utf8')
console.log(
  `Wrote ${output.commands.length} device command records from ${workflows} workflows across ${
    files.length - 1
  } non-ASA packs (${commands} steps) to ${OUT}`
)
