import fs from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { AiService, buildSystemPrompt } from '../src/main/ai'
import { DEFAULT_SETTINGS } from '../src/shared/themes'
import {
  analyzeAiCommands,
  extractCommands,
  parseAiContent,
  promptInputText,
  sanitizeTerminalText,
  toFillableCommand
} from '../src/shared/ai-utils'
import type { Store } from '../src/main/store'
import type { AiChatRequest } from '../src/shared/types'

function fakeStore(
  overrides: { aiEnabled: boolean; aiProfiles?: unknown[]; aiActiveProfileId?: string },
  key?: string
): Store {
  const settings = { ...structuredClone(DEFAULT_SETTINGS), ...overrides }
  return {
    getSettings: () => structuredClone(settings),
    getAiKey: () => key
  } as unknown as Store
}

function testProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-provider',
    name: 'Test provider',
    kind: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    model: 'test-model',
    authStyle: 'bearer',
    maxTokens: 512,
    temperature: 0.2,
    local: false,
    ...overrides
  }
}

const baseRequest: AiChatRequest = {
  requestId: 'request-12345678',
  profileId: 'local-ollama',
  messages: [{ role: 'user', content: 'The ASA is dropping packets.' }],
  context: {},
  includeContext: false
}

describe('AI request boundary', () => {
  it('refuses to call a provider while the assistant is disabled', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network must not be used')))
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const service = new AiService(fakeStore({ aiEnabled: false }))
      const result = await service.chat(baseRequest)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.toLowerCase()).toContain('off')
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('refuses unknown providers without making a request', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network must not be used')))
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const service = new AiService(fakeStore({ aiEnabled: true }))
      const result = await service.chat({ ...baseRequest, profileId: 'missing-profile' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('no longer exists')
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('has no execution surface', () => {
    const methods = Object.getOwnPropertyNames(AiService.prototype).filter(
      (name) => name !== 'constructor'
    )
    expect(methods.sort()).toEqual(['cancel', 'chat', 'listModels', 'profile', 'request'])
    expect(methods.some((name) => /execute|write|send|run|terminal|command/i.test(name))).toBe(false)
  })

  it('does not import terminal, SSH, shell, or IPC modules', () => {
    const source = fs.readFileSync('src/main/ai.ts', 'utf8')
    for (const forbidden of [
      'child_process',
      'node-pty',
      'ssh2',
      'SessionManager',
      'terminals.write',
      'ipcMain',
      'BrowserWindow'
    ]) {
      expect(source).not.toContain(forbidden)
    }
  })
})

describe('AI provider requests', () => {
  it('builds an OpenAI-compatible request with bearer auth', async () => {
    const profile = testProfile()
    const store = fakeStore(
      { aiEnabled: true, aiProfiles: [profile], aiActiveProfileId: profile.id },
      'sk-provider-key'
    )
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'check the interface' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const result = await new AiService(store).chat({
        ...baseRequest,
        profileId: profile.id,
        includeContext: false
      })
      expect(result).toEqual({ ok: true, text: 'check the interface' })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('https://api.example.com/v1/chat/completions')
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-provider-key')
      const body = JSON.parse(String(init.body))
      expect(body.model).toBe('test-model')
      expect(body.stream).toBe(false)
      expect(body.messages[0].role).toBe('system')
      expect(body.messages[0].content).toContain('You cannot execute commands')
      expect(body.messages.at(-1)).toEqual({ role: 'user', content: baseRequest.messages[0].content })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('builds an Anthropic messages request with x-api-key auth', async () => {
    const profile = testProfile({
      kind: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-test',
      authStyle: 'x-api-key'
    })
    const store = fakeStore(
      { aiEnabled: true, aiProfiles: [profile], aiActiveProfileId: profile.id },
      'anthropic-key'
    )
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'check the route' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const result = await new AiService(store).chat({
        ...baseRequest,
        profileId: profile.id,
        includeContext: false
      })
      expect(result).toEqual({ ok: true, text: 'check the route' })
      const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('https://api.anthropic.com/v1/messages')
      const headers = init.headers as Record<string, string>
      expect(headers['x-api-key']).toBe('anthropic-key')
      expect(headers['anthropic-version']).toBe('2023-06-01')
      const body = JSON.parse(String(init.body))
      expect(body.model).toBe('claude-test')
      expect(body.system).toContain('You cannot execute commands')
      expect(body.messages.some((message: { role: string }) => message.role === 'system')).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('accepts a pasted full completion URL without doubling the path', async () => {
    const profile = testProfile({ baseUrl: 'https://api.example.com/v1/chat/completions' })
    const store = fakeStore(
      { aiEnabled: true, aiProfiles: [profile], aiActiveProfileId: profile.id },
      'key'
    )
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchSpy)
    try {
      await new AiService(store).chat({ ...baseRequest, profileId: profile.id })
      const [url] = fetchSpy.mock.calls[0] as unknown as [string]
      expect(url).toBe('https://api.example.com/v1/chat/completions')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('AI system prompt', () => {
  it('states the hard safety rules and marks terminal output as untrusted', () => {
    const prompt = buildSystemPrompt({
      ...baseRequest,
      includeContext: true,
      context: {
        deviceTypeName: 'Cisco ASA',
        vendor: 'Cisco',
        family: 'ASA',
        hostLabel: 'lab-asa',
        deviceNotes: ['ASA 9.24'],
        terminalTail: 'Interface GigabitEthernet0/1 is down',
        currentCommand: 'show interface',
        runbookHints: ['### Packet capture\ncapture cap interface outside match ip any any']
      }
    })
    expect(prompt).toContain('You cannot execute commands')
    expect(prompt).toContain('UNTRUSTED DATA')
    expect(prompt).toContain('Interface GigabitEthernet0/1 is down')
    expect(prompt).toContain('Cisco ASA')
    expect(prompt).toContain('capture cap interface outside')
    expect(prompt).toContain('cleanup')
  })

  it('omits terminal context when the user turns it off', () => {
    const prompt = buildSystemPrompt({
      ...baseRequest,
      includeContext: false,
      context: { terminalTail: 'super-secret-output', currentCommand: 'show run' }
    })
    expect(prompt).not.toContain('super-secret-output')
    expect(prompt).not.toContain('show run')
  })
})

describe('AI command parsing', () => {
  it('splits prose and fenced command blocks', () => {
    const segments = parseAiContent(
      'Check the interface first:\n```bash\nciscoasa/act# show interface\nshow version\n```\nThen compare.'
    )
    expect(segments.map((segment) => segment.kind)).toEqual(['text', 'code', 'text'])
    const code = segments[1]
    if (code.kind !== 'code') throw new Error('expected a code block')
    expect(code.block.language).toBe('bash')
    expect(code.block.commands).toEqual(['show interface', 'show version'])
  })

  it('strips device prompts and skips comment lines', () => {
    expect(extractCommands('ciscoasa/act# show run\n! note\n# note\nshow clock')).toEqual([
      'show run',
      'show clock'
    ])
  })

  it('never returns more than one line for a prompt fill', () => {
    expect(toFillableCommand('ciscoasa/act# show run\nreload')).toBe('show run')
    expect(toFillableCommand('show run\r\nreload')).toBe('show run')
    expect(toFillableCommand('   ')).toBeNull()
    expect(toFillableCommand('\nreload')).toBeNull()
    expect(toFillableCommand('show\u0000 run')).toBe('show run')
  })

  it('does not treat a prompt-only line as a command', () => {
    expect(toFillableCommand('ciscoasa/act#')).toBeNull()
  })

  it('removes ANSI, control, and bidi characters from commands', () => {
    const filled = toFillableCommand('\u001b[31mreload\u001b[0m\u0003\u202e')
    expect(filled).toBe('reload')
    expect(filled).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/)
  })

  it('rejects absurdly long commands instead of truncating them', () => {
    expect(toFillableCommand('show run '.repeat(600))).toBeNull()
  })

  it('flags debug/capture answers without cleanup', () => {
    const missing = analyzeAiCommands([
      'capture cap interface outside match ip any any',
      'show capture cap'
    ])
    expect(missing.startsDebugOrCapture).toBe(true)
    expect(missing.hasCleanup).toBe(false)

    const complete = analyzeAiCommands([
      'capture cap interface outside match ip any any',
      'no capture cap'
    ])
    expect(complete.startsDebugOrCapture).toBe(true)
    expect(complete.hasCleanup).toBe(true)
  })

  it('flags state-changing commands', () => {
    expect(analyzeAiCommands(['show run']).stateChanging).toBe(false)
    expect(analyzeAiCommands(['reload in 10']).stateChanging).toBe(true)
    expect(analyzeAiCommands(['write memory']).stateChanging).toBe(true)
  })

  it('detects text already typed after the prompt', () => {
    expect(promptInputText('PS C:\\Users\\lab> ')).toBe('')
    expect(promptInputText('ciscoasa/act# ')).toBe('')
    expect(promptInputText('ciscoasa/act# show')).toBe('show')
    expect(promptInputText('user@host:~$ rm -')).toBe('rm -')
    expect(promptInputText('show run')).toBe('show run')
  })
})

describe('terminal context redaction', () => {
  it('keeps output shape while removing credential values', () => {
    const input = [
      'show run | include secret',
      'enable secret 5 $1$abc$def',
      'username admin privilege 15 secret 5 $1$hashvalue',
      'snmp-server community public RO',
      'password: hunter2',
      'Authorization: Bearer eyJhbGciOi',
      'crypto isakmp key Sekrit address 192.0.2.1',
      'show clock',
      '12:00:00.000 UTC Mon Nov 23 2026'
    ].join('\n')
    const clean = sanitizeTerminalText(input)
    expect(clean).not.toContain('$1$abc$def')
    expect(clean).not.toContain('$1$hashvalue')
    expect(clean).not.toContain('public')
    expect(clean).not.toContain('hunter2')
    expect(clean).not.toContain('eyJhbGciOi')
    expect(clean).not.toContain('Sekrit')
    expect(clean).toContain('show clock')
    expect(clean).toContain('12:00:00.000 UTC')
    expect(clean.split('\n')).toHaveLength(9)
  })

  it('drops private-key blocks entirely', () => {
    const clean = sanitizeTerminalText(
      'before\n-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----\nafter'
    )
    expect(clean).not.toContain('MIIEowIBAAKCAQEA')
    expect(clean).toContain('before')
    expect(clean).toContain('after')
  })

  it('strips ANSI and control characters but preserves line breaks', () => {
    const clean = sanitizeTerminalText('\u001b[32mline one\u001b[0m\nline two\u0007')
    expect(clean).toBe('line one\nline two')
  })
})
