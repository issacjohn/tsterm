const COMMAND_START =
  /^(?:show|display|debug|undebug|capture|monitor|terminal|clear|no|ping|traceroute|tracert|nslookup|dig|host|ipconfig|ip|ifconfig|netsh|route|arp|netstat|ss|tcpdump|pktmon|curl|openssl|grep|systemctl|journalctl|nmcli|sudo|write|copy|reload|configure|packet-trace|get-|test-|resolve-)\b/i

export function looksLikeCommand(value: string): boolean {
  const command = value.trim()
  if (!command || command.length > 4096) return false
  if (/[\r\n]/.test(command)) return false
  if (/^(?:https?:\/\/|www\.)/i.test(command)) return false
  if (/[{}]/.test(command)) return false
  return COMMAND_START.test(command)
}

export function isSmallModelName(value: string): boolean {
  const model = value.trim().toLowerCase().replace(/:latest$/, '')
  if (!model) return false
  if (model === 'llama3.2') return true
  return /(?:^|[:/_-])(1b|2b|3b|mini|tiny)(?:$|[:/_.-])/.test(model)
}

export function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

const PROMPT_PREFIX = /^\s*(?:[A-Za-z0-9_.@:/~-]{1,96}[#>$%](?:\s+|$))+/
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g
/**
 * C0/C1 controls, bidi overrides, zero-width joiners, and BOM. A "fill" writes
 * straight to the PTY, so no control character may survive parsing.
 */
const UNSAFE_CONTROLS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g

export function stripControlChars(value: string): string {
  return value.replace(ANSI, '').replace(UNSAFE_CONTROLS, '').replace(/\t/g, '  ')
}

const SECRET_LINE_PATTERNS: Array<[RegExp, string]> = [
  [/^(\s*enable\s+(?:password|secret)\s+(?:\d+\s+)?).*$/i, '$1[redacted]'],
  [/^(\s*username\s+\S+.*?\s(?:password|secret)\s+(?:\d+\s+)?).*$/i, '$1[redacted]'],
  [/^(\s*snmp-server\s+community\s+)\S+.*$/i, '$1[redacted]'],
  [/^(\s*snmp-server\s+user\s+\S+\s+).*$/i, '$1[redacted]'],
  [
    /^(\s*(?:crypto\s+isakmp\s+key|pre-shared-key(?:\s+\S+)?|key-string|tacacs-server\s+key|radius-server\s+key|ntp\s+authentication-key\s+\d+\s+\S+)\s+).*$/i,
    '$1[redacted]'
  ],
  [
    /^(\s*(?:password|passwd|secret|api[-_ ]?key|access[-_ ]?token|auth[-_ ]?token)\s*[:=]\s*).*$/i,
    '$1[redacted]'
  ],
  [/^(\s*(?:authorization|proxy-authorization)\s*:\s*(?:bearer|basic)\s+).*$/i, '$1[redacted]']
]

/**
 * Terminal output is untrusted and may contain secrets from `show run`, logs,
 * or environment dumps. Keep the shape of the output, remove control
 * characters, and redact common credential lines before the text leaves the
 * machine.
 */
export function sanitizeTerminalText(input: string): string {
  const lines = stripControlChars(input).split('\n')
  const output: string[] = []
  let inPrivateKey = false
  for (const line of lines) {
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(line)) {
      inPrivateKey = true
      output.push('[redacted private key]')
      continue
    }
    if (inPrivateKey) {
      if (/-----END [A-Z ]*PRIVATE KEY-----/i.test(line)) inPrivateKey = false
      continue
    }
    let next = line
    for (const [pattern, replacement] of SECRET_LINE_PATTERNS) {
      if (pattern.test(next)) {
        next = next.replace(pattern, replacement)
        break
      }
    }
    output.push(next)
  }
  return output.join('\n')
}

export interface AiBlock {
  language: string
  code: string
  commands: string[]
}

export type AiSegment = { kind: 'text'; content: string } | { kind: 'code'; block: AiBlock }

export function stripPromptPrefix(line: string): string {
  return stripControlChars(line)
    .replace(/[\u0000-\u001f]/g, '')
    .replace(PROMPT_PREFIX, '')
    .trim()
}

export function extractCommands(code: string): string[] {
  return code
    .split(/\r?\n/)
    .map((line) => stripPromptPrefix(line))
    .filter((line) => line && !line.startsWith('!') && !line.startsWith('#'))
}

export function parseAiContent(content: string): AiSegment[] {
  const segments: AiSegment[] = []
  const pattern = /```([A-Za-z0-9_+-]*)\r?\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content)) !== null) {
    const text = stripControlChars(content.slice(lastIndex, match.index)).trim()
    if (text) segments.push({ kind: 'text', content: text })
    const code = stripControlChars(match[2]).replace(/\s+$/, '')
    segments.push({
      kind: 'code',
      block: {
        language: match[1] || 'text',
        code,
        commands: extractCommands(code)
      }
    })
    lastIndex = match.index + match[0].length
  }
  const tail = stripControlChars(content.slice(lastIndex)).trim()
  if (tail) segments.push({ kind: 'text', content: tail })
  if (segments.length === 0 && content.trim()) {
    segments.push({ kind: 'text', content: stripControlChars(content).trim() })
  }
  return segments
}

/**
 * A "fill" must never submit a command. Strip prompts, take exactly one line,
 * and reject anything that still contains a line break or control character.
 */
export function toFillableCommand(command: string): string | null {
  const first = command.split(/\r?\n/)[0] ?? ''
  const clean = stripPromptPrefix(first).trim()
  if (!clean || clean.length > 4096) return null
  return clean
}

/** Text the user has already typed after the last prompt character. */
export function promptInputText(beforeCursor: string): string {
  const line = stripControlChars(beforeCursor).replace(/\s+$/, '')
  const prompt = /^.*[#>$%]\s?/.exec(line)
  return (prompt ? line.slice(prompt[0].length) : line).trim()
}

const DEBUG_OR_CAPTURE =
  /\b(debug\s+\S|packet-trace|tcpdump\b|pktmon\s+start|monitor\s+capture\s+start|capture\s+\S+\s+(?:interface|access-list|match))/i
const CLEANUP_COMMAND =
  /\b(undebug|no\s+debug|no\s+capture|clear\s+capture|pktmon\s+stop|monitor\s+capture\s+(?:stop|clear)|tcpdump\b.*\s-c\s)/i
const STATE_CHANGING =
  /\b(reload|write\s+memory|erase\s+|format\s+|clear\s+config|delete\s+|shutdown|no\s+shutdown|copy\s+run|configure\s+terminal)\b/i

export interface AiCommandRisk {
  startsDebugOrCapture: boolean
  hasCleanup: boolean
  stateChanging: boolean
}

export function analyzeAiCommands(commands: string[]): AiCommandRisk {
  return {
    startsDebugOrCapture: commands.some((command) => DEBUG_OR_CAPTURE.test(command)),
    hasCleanup: commands.some((command) => CLEANUP_COMMAND.test(command)),
    stateChanging: commands.some((command) => STATE_CHANGING.test(command))
  }
}
