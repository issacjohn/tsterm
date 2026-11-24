import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const ROOT = process.cwd()
const sourcePath = path.resolve(
  process.argv[2] || process.env.TSTERM_ASA_HELP || path.join(ROOT, 'asa_commands.json')
)
const outputPath = path.join(ROOT, 'resources', 'commands', 'asa-device-help.json')

if (!fs.existsSync(sourcePath)) {
  console.error(`Device help source not found: ${sourcePath}`)
  console.error('Usage: node scripts/import-device-command-help.mjs <asa_commands.json>')
  process.exit(2)
}

const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, ''))
const sourceCommands = Array.isArray(raw.commands) ? raw.commands : []
const device = raw.device_info ?? {}
const enumDefinitions = raw.enum_definitions ?? {}
const versionMatch = /Version\s+([0-9][^\s]*)/i.exec(String(device.software_version ?? ''))
const version = versionMatch?.[1] ?? '9.24'

const collapse = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()
const slug = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/<=>/g, ' or ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36)

const enums = new Map()
for (const [key, value] of Object.entries(enumDefinitions)) {
  if (!Array.isArray(value)) continue
  const choices = value
    .map((item) => (typeof item === 'string' ? item : item?.token))
    .filter((item) => typeof item === 'string' && item.length > 0)
  if (!choices.length) continue
  enums.set(collapse(key), {
    choices: [...new Set(choices)],
    descriptions: value
      .filter((item) => item && typeof item === 'object')
      .map((item) => `${item.token}: ${item.description || ''}`.trim())
  })
}

const IPV4 =
  '(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
const IPV6 = '(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}'
const GENERIC = '^[^\\s\\r\\n;|&`<>?]+$'
const INTERFACE = '^[A-Za-z][A-Za-z0-9/_.:-]*$'
const MAC = '^(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$'
const URL = '^(?:[A-Za-z][A-Za-z0-9+.-]*:|/)[^\\s]+$'
const TIME = '^\\d{1,5}:\\d{1,2}:\\d{1,2}$'
const PORT = '^(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$'

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function rangeRegex(min, max) {
  const span = max - min
  if (!Number.isFinite(span) || span < 0) return '^\\d+$'
  if (span <= 40) {
    const values = []
    for (let value = min; value <= max; value += 1) values.push(String(value))
    return `^(?:${values.map(escapeRegex).join('|')})$`
  }
  return '^\\d+$'
}

function uniqueName(base, used) {
  const clean = slug(base) || 'value'
  let name = clean
  let index = 2
  while (used.has(name)) {
    name = `${clean}_${index}`
    index += 1
  }
  used.add(name)
  return name
}

function hintFromPrevious(previous) {
  const token = String(previous ?? '').toLowerCase()
  if (!token) return ''
  if (/^(interface|iface)$/.test(token)) return 'interface_name'
  if (/^(host|address|ip)$/.test(token)) return 'address'
  if (/(name|tag|group|label)$/.test(token)) return 'name'
  if (/^(user|username)$/.test(token)) return 'user'
  if (/^(profile|policy|policy-map|map|class)$/.test(token)) return 'profile'
  if (/^(acl|access-list)$/.test(token)) return 'acl'
  if (/^(route-map)$/.test(token)) return 'route_map'
  if (/^port$/.test(token)) return 'port'
  if (/^(url|uri)$/.test(token)) return 'url'
  if (/^(file|path|location)$/.test(token)) return 'path'
  if (/^(passphrase|password|secret|key)$/.test(token)) return 'secret'
  if (/^(time|timeout|duration|interval)$/.test(token)) return 'time'
  if (/^(count|number|size|id|identifier)$/.test(token)) return 'value'
  return ''
}

function parameterFor(token, previous, used, tokenDescriptions) {
  const inner = token.slice(1, -1).trim()
  const lower = inner.toLowerCase()
  const description = collapse(tokenDescriptions.get(collapse(token)) ?? '')
  const isRange = /^(-?\d+)-(-?\d+)$/.exec(inner)
  let regex = GENERIC
  let nameHint = ''

  if (isRange) {
    regex = rangeRegex(Number(isRange[1]), Number(isRange[2]))
    nameHint = 'number'
  } else if (/^(address|ip|ipv4|ip-address)$/.test(lower)) {
    regex = `^(?:${IPV4}|${IPV6}|[A-Za-z0-9][A-Za-z0-9.-]*)$`
    nameHint = 'address'
  } else if (/^(ipv6|ipv6-address)$/.test(lower)) {
    regex = `^(?:${IPV6})$`
    nameHint = 'ipv6_address'
  } else if (/^(ipprefix|ip-prefix|prefix|subnet)$/.test(lower)) {
    regex = `^(?:${IPV4}/${0,2}\\d{1,2}|[A-Za-z0-9][A-Za-z0-9.-]*)$`
    nameHint = 'prefix'
  } else if (/^(interface|iface|interface-name)$/.test(lower)) {
    regex = INTERFACE
    nameHint = 'interface_name'
  } else if (/^(mac|mac-address)$/.test(lower)) {
    regex = MAC
    nameHint = 'mac'
  } else if (/^(url|uri)$/.test(lower)) {
    regex = URL
    nameHint = 'url'
  } else if (/^(hh:mm:ss|hhh:mm:ss|hhhh:mm:ss)$/.test(lower)) {
    regex = TIME
    nameHint = 'time'
  } else if (/^(port)$/.test(lower)) {
    regex = PORT
    nameHint = 'port'
  } else if (/^(regex|regexp)$/.test(lower)) {
    regex = GENERIC
    nameHint = 'regex'
  } else if (/^(string|text|line|word|value)$/.test(lower)) {
    nameHint = hintFromPrevious(previous) || (lower === 'string' ? 'value' : lower)
  } else if (lower === 'dynamic') {
    nameHint = hintFromPrevious(previous) || 'dynamic_value'
  } else {
    nameHint = slug(inner) || hintFromPrevious(previous) || 'value'
  }

  const name = uniqueName(nameHint || hintFromPrevious(previous) || 'value', used)
  return {
    name,
    required: true,
    regex,
    description: description || `Device help value for ${token}`,
    placeholder: token
  }
}

function inferRisk(command, mode) {
  const lower = command.toLowerCase()
  if (/^(reload|erase|format|delete|downgrade|restore|revert|fsck|fips)\b/.test(lower)) {
    return 'destructive'
  }
  if (/^write\s+erase\b/.test(lower)) return 'destructive'
  if (/^clear\s+configure\b/.test(lower) && !/^clear\s+configure\s+access-list\b/.test(lower)) {
    return 'destructive'
  }
  if (/^(debug|undebug|capture|no\s+capture|packet-tracer|perfmon|test)\b/.test(lower)) {
    return 'diagnostic'
  }
  if (
    /^(show|ping|traceroute|dir|more|verify|help|who|pwd|exit|quit|logout|disable|enable)\b/.test(
      lower
    )
  ) {
    return 'read_only'
  }
  if (/^clear\b/.test(lower)) return 'mutating'
  if (/^no\b/.test(lower)) return 'mutating'
  if (mode !== 'exec') return 'mutating'
  return 'mutating'
}

function keywordsFor(template, category, mode, description, enumChoices) {
  const text = `${template} ${category} ${mode} ${description} ${enumChoices.join(' ')}`.toLowerCase()
  const tokens = text.match(/[a-z0-9%_.:/-]+/g) ?? []
  return [...new Set(tokens.filter((token) => token.length > 1))].slice(0, 60)
}

const skip = {
  empty: 0,
  colon: 0,
  notExecutable: 0,
  unresolvedEnum: 0,
  unresolvedPlaceholder: 0,
  pipe: 0,
  tooLong: 0,
  duplicate: 0
}

const records = []
const seen = new Set()
const byMode = new Map()
const byRisk = new Map()
let enumApplications = 0

for (const entry of sourceCommands) {
  if (!entry || typeof entry.command !== 'string') {
    skip.empty += 1
    continue
  }
  if (entry.is_executable !== true) {
    skip.notExecutable += 1
    continue
  }
  let command = collapse(entry.command)
  if (!command) {
    skip.empty += 1
    continue
  }
  if (command.startsWith(':')) {
    skip.colon += 1
    continue
  }
  if (command.length > 400) {
    skip.tooLong += 1
    continue
  }
  const mode = collapse(entry.mode) || 'exec'

  // The help crawler sometimes emitted pipe-separated alternatives with spaces,
  // for example "<hhhh:mm:ss> |<hhh:mm:ss>|<hh:mm:ss>". They describe one
  // parameter, so keep the first form and let the regex accept the family.
  command = command.replace(/(<[^>]*>)\s*\|(?:\s*<[^>]*>)+\s*/g, '$1')

  const used = new Set()
  const parameters = []
  const tokenDescriptions = new Map()
  for (const parameter of entry.parameters ?? []) {
    if (parameter?.token && parameter?.description) {
      tokenDescriptions.set(collapse(parameter.token), collapse(parameter.description))
    }
  }

  // Resolve the "keyword choice" tokens that the crawler wrote as <a <=> b>.
  command = command.replace(/<[^>]*<=>[^>]*>/g, (token) => {
    const definition = enums.get(collapse(token))
    if (!definition) {
      skip.unresolvedEnum += 1
      return token
    }
    enumApplications += 1
    const name = uniqueName(slug(token.slice(1, -1)), used)
    parameters.push({
      name,
      required: true,
      regex: `^(?:${definition.choices.map(escapeRegex).join('|')})$`,
      description: definition.descriptions.length
        ? definition.descriptions.join('; ').slice(0, 300)
        : `One of: ${definition.choices.join(', ')}`,
      placeholder: `<${definition.choices.join('|')}>`
    })
    return `{${name}}`
  })
  if (/<[^>]*<=>[^>]*>/.test(command)) {
    continue
  }

  // Resolve the remaining value placeholders.
  command = command.replace(/<[^>]*>/g, (token, offset) => {
    const before = command.slice(0, offset).trim()
    const previous = before ? before.split(/\s+/).at(-1) : ''
    const parameter = parameterFor(token, previous, used, tokenDescriptions)
    parameters.push(parameter)
    return `{${parameter.name}}`
  })

  command = collapse(command)
  if (/[<>]/.test(command)) {
    skip.unresolvedPlaceholder += 1
    continue
  }
  if (command.includes('|')) {
    skip.pipe += 1
    continue
  }
  if (!command || command.length > 400) {
    skip.tooLong += 1
    continue
  }

  const category = collapse(entry.category) || 'General ASA CLI'
  const description = collapse(entry.description) || collapse(entry.llm_context).slice(0, 300)
  const risk = inferRisk(command, mode)
  const signature = `${mode.toLowerCase()}|${command.toLowerCase()}`
  if (seen.has(signature)) {
    skip.duplicate += 1
    continue
  }
  seen.add(signature)

  const idHash = createHash('sha1')
    .update(`${mode}|${command}`)
    .digest('hex')
    .slice(0, 12)
  const modeSlug = slug(mode) || 'mode'
  const syntax = parameters.reduce(
    (value, parameter) => value.replaceAll(`{${parameter.name}}`, parameter.placeholder),
    command
  )
  const record = {
    id: `asa.device.${modeSlug}.${idHash}`,
    vendor: 'cisco-asa',
    commandTemplate: command,
    description: description || syntax,
    category,
    mode,
    risk,
    keywords: keywordsFor(
      command,
      category,
      mode,
      description,
      parameters.flatMap((parameter) => {
        const match = /\^\(\?:([^)]*)\)\$/.exec(parameter.regex)
        return match ? match[1].split('|') : []
      })
    ),
    parameters,
    examples: [],
    cleanup: [],
    source: 'device-help',
    version,
    syntax,
    modes: [mode],
    referenceOnly: true
  }
  records.push(record)
  byMode.set(mode, (byMode.get(mode) ?? 0) + 1)
  byRisk.set(risk, (byRisk.get(risk) ?? 0) + 1)
}

records.sort((left, right) => {
  if (left.mode !== right.mode) return left.mode.localeCompare(right.mode)
  return left.commandTemplate.localeCompare(right.commandTemplate)
})

const ids = new Set(records.map((record) => record.id))
if (ids.size !== records.length) {
  throw new Error(`Generated ${records.length} records but only ${ids.size} unique IDs.`)
}
const unresolved = records.find((record) => /[<>]/.test(record.commandTemplate))
if (unresolved) {
  throw new Error(`Unresolved placeholder in ${unresolved.mode}: ${unresolved.commandTemplate}`)
}

const output = {
  version: 1,
  vendor: 'cisco-asa',
  generatedAt: new Date().toISOString(),
  source: {
    file: path.basename(sourcePath),
    hostname: device.hostname,
    address: device.ip_address,
    softwareVersion: device.software_version,
    extractedAt: device.extracted_at_utc,
    commands: sourceCommands.length
  },
  commands: records
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(output), 'utf8')

console.log(`Wrote ${records.length} normalized device help records to ${outputPath}`)
console.log(
  `Skipped: ${JSON.stringify(skip)}; enum choices applied: ${enumApplications}; version: ${version}`
)
console.log('Modes:', Object.fromEntries([...byMode.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)))
console.log('Risks:', Object.fromEntries(byRisk))
