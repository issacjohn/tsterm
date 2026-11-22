import type { DeviceType, Workflow } from '@shared/types'
import { tokenizeCommand } from '@shared/catalog-utils'

export interface Suggestion {
  word: string
  suffix: string
  source: 'catalog' | 'history' | 'common'
  kind: 'complete' | 'next'
}

export interface SuggestionEngineOptions {
  commands?: string[]
  history?: string[]
  common?: string[]
}

const COMMON_BY_FAMILY: Record<string, string[]> = {
  cisco: [
    'show',
    'show version',
    'show running-config',
    'show logging',
    'show interface',
    'show ip interface brief',
    'show ip route',
    'show ip bgp summary',
    'show ip ospf neighbor',
    'show crypto session',
    'show crypto ikev2 sa',
    'show crypto ipsec sa',
    'show vpn-sessiondb',
    'show aaa-server',
    'debug',
    'undebug',
    'clear',
    'ping',
    'traceroute',
    'terminal length 0',
    'terminal monitor',
    'configure terminal',
    'packet-tracer',
    'capture',
    'show capture',
    'show conn',
    'show cpu',
    'show memory'
  ],
  windows: [
    'Get-',
    'Get-NetAdapter',
    'Get-NetIPConfiguration',
    'Get-NetRoute',
    'Get-NetTCPConnection',
    'Get-DnsClientServerAddress',
    'Test-NetConnection',
    'Resolve-DnsName',
    'Get-VpnConnection',
    'Get-NetFirewallProfile',
    'Get-WinEvent',
    'ipconfig',
    'ipconfig /all',
    'ipconfig /flushdns',
    'nslookup',
    'tracert',
    'pathping',
    'netstat',
    'route print',
    'netsh',
    'pktmon',
    'curl.exe'
  ],
  linux: [
    'ip',
    'ip addr',
    'ip route',
    'ip route get',
    'ss',
    'ss -tulpn',
    'ping',
    'traceroute',
    'mtr',
    'dig',
    'resolvectl',
    'tcpdump',
    'curl',
    'openssl',
    'journalctl',
    'systemctl',
    'nmcli',
    'sudo',
    'grep',
    'tail',
    'cat',
    'df',
    'free',
    'uptime',
    'ethtool'
  ],
  macos: [
    'ifconfig',
    'netstat',
    'route',
    'scutil',
    'networksetup',
    'dscacheutil',
    'dig',
    'ping',
    'traceroute',
    'tcpdump',
    'curl',
    'openssl',
    'log',
    'system_profiler',
    'sudo',
    'pfctl',
    'lsof'
  ],
  network: [
    'show',
    'show version',
    'show interface',
    'show log',
    'ping',
    'traceroute',
    'debug',
    'undebug',
    'clear',
    'test'
  ]
}

export function commonCommandsForFamily(family: string | undefined): string[] {
  const value = (family ?? '').toLowerCase()
  if (value.includes('windows')) return COMMON_BY_FAMILY.windows
  if (value.includes('linux')) return COMMON_BY_FAMILY.linux
  if (value.includes('mac')) return COMMON_BY_FAMILY.macos
  if (value.includes('cisco')) return COMMON_BY_FAMILY.cisco
  return COMMON_BY_FAMILY.network
}

export function commandsForDeviceType(type: DeviceType | undefined): string[] {
  if (!type) return []
  const workflows: Workflow[] = type.workflows
  const commands: string[] = []
  for (const workflow of workflows) {
    for (const step of [...workflow.steps, ...workflow.verify, ...workflow.cleanup]) {
      if (step.command) commands.push(step.command)
    }
  }
  return commands
}

export function commonCommandsForType(type: DeviceType | undefined, platform?: string): string[] {
  if (!type) {
    if (platform === 'win32') return COMMON_BY_FAMILY.windows
    if (platform === 'darwin') return COMMON_BY_FAMILY.macos
    return COMMON_BY_FAMILY.linux
  }
  if (type.family === 'Endpoint') {
    if (type.id.includes('windows')) return COMMON_BY_FAMILY.windows
    if (type.id.includes('mac')) return COMMON_BY_FAMILY.macos
    if (type.id.includes('linux')) return COMMON_BY_FAMILY.linux
  }
  return COMMON_BY_FAMILY.cisco
}

function stripPrompt(line: string): { command: string; promptMatched: boolean } {
  const patterns = [
    /^PS\s+[^>]{1,100}>\s?/,
    /^\[[^\]]{1,100}\][#$>%]\s?/,
    /^[^\s]{1,70}[#$>%]\s?/,
    /^[^\s]{1,70}@[^\n]{0,100}?[#$>%]\s?/
  ]
  for (const pattern of patterns) {
    const match = line.match(pattern)
    if (match) {
      return { command: line.slice(match[0].length), promptMatched: true }
    }
  }
  return { command: line, promptMatched: false }
}

function isPlaceholder(token: string): boolean {
  return /^\{[^}]+\}$/.test(token) || /^<[^>]+>$/.test(token)
}

function contextKey(tokens: string[]): string {
  return tokens.slice(-3).join('\u0000').toLowerCase()
}

export class SuggestionEngine {
  private nextTokens = new Map<string, Map<string, number>>()
  private unigrams = new Map<string, number>()
  private history: string[] = []

  constructor(options: SuggestionEngineOptions = {}) {
    const commands = [...(options.commands ?? []), ...(options.common ?? [])]
    for (const command of commands) this.addCommand(command, options.common?.includes(command) ? 2 : 4)
    for (const entry of options.history ?? []) this.addHistory(entry)
  }

  addCommand(command: string, weight = 4): void {
    const tokens = tokenizeCommand(command).filter((token) => !isPlaceholder(token))
    if (tokens.length === 0) return
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]
      const count = this.unigrams.get(token) ?? 0
      this.unigrams.set(token, count + (index === 0 ? 2 : 1))
      if (index === 0) continue
      const key = contextKey(tokens.slice(0, index))
      let bucket = this.nextTokens.get(key)
      if (!bucket) {
        bucket = new Map()
        this.nextTokens.set(key, bucket)
      }
      bucket.set(token, (bucket.get(token) ?? 0) + weight)
    }
  }

  addHistory(command: string): void {
    const trimmed = command.trim()
    if (!trimmed || trimmed.length > 300) return
    this.history.unshift(trimmed)
    this.history = this.history.slice(0, 300)
    const tokens = tokenizeCommand(trimmed).filter((token) => !isPlaceholder(token))
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]
      this.unigrams.set(token, (this.unigrams.get(token) ?? 0) + 1)
      if (index === 0) continue
      const key = contextKey(tokens.slice(0, index))
      let bucket = this.nextTokens.get(key)
      if (!bucket) {
        bucket = new Map()
        this.nextTokens.set(key, bucket)
      }
      bucket.set(token, (bucket.get(token) ?? 0) + 8)
    }
  }

  suggest(line: string): Suggestion | null {
    const naive = line.length > 400 ? line.slice(-400) : line
    if (/\b(password|passphrase|secret|otp)\b/i.test(naive)) return null
    const { command, promptMatched } = stripPrompt(naive)
    const trimmed = command.trimEnd()
    if (!trimmed) return null
    const trailingSpace = /\s$/.test(command)
    const tokens = tokenizeCommand(trimmed)
    if (tokens.length === 0) return null
    const partial = trailingSpace ? '' : tokens[tokens.length - 1]
    const context = trailingSpace ? tokens : tokens.slice(0, -1)
    if (!partial && context.length === 0) return null
    if (/\b(password|passphrase|secret|otp)\b/i.test(context.join(' '))) return null

    const lookup = (length: number): Map<string, number> | undefined => {
      const slice = context.slice(-length)
      return this.nextTokens.get(contextKey(slice))
    }

    for (let length = Math.min(3, context.length); length >= 1; length -= 1) {
      const bucket = lookup(length)
      if (!bucket) continue
      const candidate = this.bestCandidate(bucket, partial)
      if (candidate) {
        return this.makeSuggestion(candidate, partial, trailingSpace, 'catalog')
      }
    }

    if (partial.length >= 2) {
      const candidate = this.bestCandidate(this.unigrams, partial)
      if (candidate) {
        return this.makeSuggestion(candidate, partial, trailingSpace, promptMatched ? 'common' : 'history')
      }
    }
    if (!promptMatched && context.length >= 2) {
      // A command without a recognized prompt: still offer next-word help.
      const bucket = lookup(Math.min(3, context.length))
      if (bucket) {
        const candidate = this.bestCandidate(bucket, partial)
        if (candidate) return this.makeSuggestion(candidate, partial, trailingSpace, 'catalog')
      }
    }
    return null
  }

  private bestCandidate(bucket: Map<string, number>, partial: string): string | null {
    const prefix = partial.toLowerCase()
    let best: string | null = null
    let bestScore = -1
    for (const [word, score] of bucket) {
      if (!word || word === partial) continue
      if (isPlaceholder(word)) continue
      if (!word.toLowerCase().startsWith(prefix)) continue
      if (word.length === prefix.length) continue
      if (!/[a-zA-Z0-9]/.test(word)) continue
      const bonus = prefix && word.toLowerCase() === prefix ? 1000 : prefix.length * 2
      const total = score * 10 + bonus - Math.abs(word.length - prefix.length) * 0.05
      if (total > bestScore) {
        best = word
        bestScore = total
      }
    }
    return best
  }

  private makeSuggestion(
    word: string,
    partial: string,
    _trailingSpace: boolean,
    source: Suggestion['source']
  ): Suggestion | null {
    if (!word || word === partial) return null
    const suffix = word.slice(partial.length)
    if (!suffix) return null
    return {
      word,
      suffix,
      source,
      kind: partial ? 'complete' : 'next'
    }
  }

  getRecent(): string[] {
    return [...this.history]
  }
}

export function buildEngine(
  deviceType: DeviceType | undefined,
  history: string[],
  platform: string
): SuggestionEngine {
  return new SuggestionEngine({
    commands: commandsForDeviceType(deviceType),
    common: commonCommandsForType(deviceType, platform),
    history
  })
}

export function extractCommandForHistory(line: string): string | null {
  const { command } = stripPrompt(line)
  const value = command.trim()
  if (!value) return null
  if (/\b(password|passphrase|secret|otp)\b/i.test(value)) return null
  if (value.length > 300) return null
  return value
}

export function isPasswordPrompt(line: string): boolean {
  return /(?:password|passphrase|otp|verification code)\s*:?\s*$/i.test(line)
}
