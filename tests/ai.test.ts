import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AiService, buildSystemPrompt } from '../src/main/ai'
import { CatalogService } from '../src/main/catalog'
import { DEFAULT_SETTINGS } from '../src/shared/themes'
import {
  analyzeAiCommands,
  extractCommands,
  extractInlineCommands,
  isLoopbackUrl,
  isSmallModelName,
  looksLikeCommand,
  parseAiContent,
  promptInputText,
  sanitizeTerminalText,
  toFillableCommand
} from '../src/shared/ai-utils'
import type { Store } from '../src/main/store'
import { buildRunbookHints } from '../src/shared/ai-knowledge'
import type { AiChatRequest, AiProfile, DeviceType } from '../src/shared/types'

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

function testProfile(overrides: Partial<AiProfile> = {}): AiProfile {
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
    expect(methods.sort()).toEqual([
      'cancel',
      'chat',
      'fetchWithTimeout',
      'listModels',
      'localStatus',
      'profile',
      'pullModel',
      'request'
    ])
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
      expect(body.stream).toBe(true)
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

  it('streams OpenAI-compatible deltas as they arrive', async () => {
    const profile = testProfile()
    const store = fakeStore(
      { aiEnabled: true, aiProfiles: [profile], aiActiveProfileId: profile.id },
      'key'
    )
    const encoder = new TextEncoder()
    const chunks = [
      'data: {"choices":[{"delta":{"content":"show "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"interface "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"ip brief"}}]}\n\n',
      'data: [DONE]\n\n'
    ]
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      }
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    )
    const deltas: string[] = []
    try {
      const result = await new AiService(store).chat(
        { ...baseRequest, profileId: profile.id },
        (delta) => deltas.push(delta)
      )
      expect(result).toEqual({ ok: true, text: 'show interface ip brief' })
      expect(deltas.length).toBeGreaterThan(0)
      expect(deltas.join('')).toBe('show interface ip brief')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('uses native Ollama chat with a larger context window', async () => {
    const profile = testProfile({
      id: 'local-ollama',
      name: 'Ollama (local)',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'qwen2.5:7b',
      authStyle: 'none',
      local: true
    })
    const store = fakeStore(
      { aiEnabled: true, aiProfiles: [profile], aiActiveProfileId: profile.id },
      undefined
    )
    const encoder = new TextEncoder()
    const chunks = [
      '{"message":{"role":"assistant","content":"show "},"done":false}\n',
      '{"message":{"role":"assistant","content":"ip interface brief"},"done":false}\n',
      '{"done":true}\n'
    ]
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      }
    })
    const fetchSpy = vi.fn(
      async () => new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
    )
    vi.stubGlobal('fetch', fetchSpy)
    const deltas: string[] = []
    try {
      const result = await new AiService(store).chat(
        { ...baseRequest, profileId: profile.id },
        (delta) => deltas.push(delta)
      )
      expect(result).toEqual({ ok: true, text: 'show ip interface brief' })
      expect(deltas.join('')).toBe('show ip interface brief')
      const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('http://127.0.0.1:11434/api/chat')
      const payload = JSON.parse(String(init.body))
      expect(payload.options.num_ctx).toBe(16384)
      expect(payload.options.num_predict).toBe(profile.maxTokens)
      expect(payload.messages[0].role).toBe('system')
      expect(payload.messages[0].content).toContain('You cannot execute commands')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('streams Anthropic text deltas', async () => {
    const profile = testProfile({
      kind: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      authStyle: 'x-api-key'
    })
    const store = fakeStore(
      { aiEnabled: true, aiProfiles: [profile], aiActiveProfileId: profile.id },
      'key'
    )
    const encoder = new TextEncoder()
    const chunks = [
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"show "}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"version"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n'
    ]
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      }
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    )
    const deltas: string[] = []
    try {
      const result = await new AiService(store).chat(
        { ...baseRequest, profileId: profile.id },
        (delta) => deltas.push(delta)
      )
      expect(result).toEqual({ ok: true, text: 'show version' })
      expect(deltas.join('')).toBe('show version')
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

describe('local Ollama model management', () => {
  const ollamaProfile = testProfile({
    id: 'local-ollama',
    name: 'Ollama (local)',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'llama3.2',
    authStyle: 'none',
    local: true
  })

  it('recognizes loopback endpoints only', () => {
    expect(isLoopbackUrl('http://127.0.0.1:11434/v1')).toBe(true)
    expect(isLoopbackUrl('http://localhost:1234/v1')).toBe(true)
    expect(isLoopbackUrl('http://[::1]:11434/v1')).toBe(true)
    expect(isLoopbackUrl('https://api.example.com/v1')).toBe(false)
    expect(isLoopbackUrl('http://192.168.1.10:11434')).toBe(false)
    expect(isLoopbackUrl('file:///tmp/ollama')).toBe(false)
    expect(isLoopbackUrl('not a url')).toBe(false)
  })

  it('reports Ollama models and matches the :latest tag', async () => {
    const store = fakeStore(
      { aiEnabled: true, aiProfiles: [ollamaProfile], aiActiveProfileId: ollamaProfile.id },
      undefined
    )
    const fetchSpy = vi.fn(async (url: string | URL | Request) => {
      const target = String(url)
      if (target.endsWith('/api/version')) {
        return new Response(JSON.stringify({ version: '0.5.7' }), { status: 200 })
      }
      if (target.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'llama3.2:latest' }] }), {
          status: 200
        })
      }
      throw new Error(`Unexpected URL ${target}`)
    })
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const result = await new AiService(store).localStatus({
        profile: ollamaProfile,
        model: 'llama3.2'
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.runtime).toBe('ollama')
        expect(result.version).toBe('0.5.7')
        expect(result.modelReady).toBe(true)
        expect(result.resolvedModel).toBe('llama3.2:latest')
        expect(result.baseUrl).toBe('http://127.0.0.1:11434')
      }
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reports a missing runtime without throwing', async () => {
    const store = fakeStore(
      { aiEnabled: true, aiProfiles: [ollamaProfile], aiActiveProfileId: ollamaProfile.id },
      undefined
    )
    const fetchSpy = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const result = await new AiService(store).localStatus({
        profile: ollamaProfile,
        model: 'llama3.2'
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.needsRuntime).toBe(true)
        expect(result.error).toContain('not responding')
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('refuses automatic downloads for non-loopback providers', async () => {
    const profile = testProfile({ baseUrl: 'https://api.example.com/v1' })
    const store = fakeStore(
      { aiEnabled: true, aiProfiles: [profile], aiActiveProfileId: profile.id },
      undefined
    )
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const result = await new AiService(store).pullModel({
        requestId: 'pull-12345678',
        profile,
        model: 'llama3.2'
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('only available for Ollama')
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('streams Ollama pull progress and completes', async () => {
    const store = fakeStore(
      { aiEnabled: true, aiProfiles: [ollamaProfile], aiActiveProfileId: ollamaProfile.id },
      undefined
    )
    const body = [
      '{"status":"pulling manifest"}',
      '{"status":"pulling 123456","completed":50,"total":100}',
      '{"status":"verifying sha256 digest"}',
      '{"status":"success"}'
    ].join('\n')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`${body}\n`))
        controller.close()
      }
    })
    const fetchSpy = vi.fn(async () => new Response(stream, { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    const events: Array<{ status: string; percent?: number }> = []
    try {
      const result = await new AiService(store).pullModel(
        {
          requestId: 'pull-12345678',
          profile: ollamaProfile,
          model: 'llama3.2'
        },
        (event) => events.push({ status: event.status, percent: event.percent })
      )
      expect(result).toEqual({ ok: true, model: 'llama3.2' })
      const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('http://127.0.0.1:11434/api/pull')
      expect(JSON.parse(String(init.body))).toEqual({ name: 'llama3.2', stream: true })
      expect(events.some((event) => event.percent === 50)).toBe(true)
      expect(events.at(-1)).toEqual({ status: 'success', percent: 100 })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('surfaces an Ollama pull error line', async () => {
    const store = fakeStore(
      { aiEnabled: true, aiProfiles: [ollamaProfile], aiActiveProfileId: ollamaProfile.id },
      undefined
    )
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('{"error":"pull model manifest: file does not exist"}\n')
        )
        controller.close()
      }
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, { status: 200 })))
    try {
      const result = await new AiService(store).pullModel({
        requestId: 'pull-12345678',
        profile: ollamaProfile,
        model: 'missing-model'
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('file does not exist')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('rejects unsafe model names before contacting Ollama', async () => {
    const store = fakeStore(
      { aiEnabled: true, aiProfiles: [ollamaProfile], aiActiveProfileId: ollamaProfile.id },
      undefined
    )
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const result = await new AiService(store).pullModel({
        requestId: 'pull-12345678',
        profile: ollamaProfile,
        model: '../../escape'
      })
      expect(result.ok).toBe(false)
      expect(fetchSpy).not.toHaveBeenCalled()
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
    expect(prompt).toContain('capture has no duration keyword')
    expect(prompt).toContain('no capture <name>')
    expect(prompt).toContain('Top-level ASA commands')
    expect(prompt).toContain('packet-tracer')
    expect(prompt).toContain('Never use source, destination')
    expect(prompt).toContain('match ip 1.1.1.1 0.0.0.0 8.8.8.8 0.0.0.0')
    expect(prompt).toContain('active device pack is Cisco ASA')
    expect(prompt).toContain('Never mention commands from another platform')
  })

  it('does not inject the ASA command index into other platforms', () => {
    const prompt = buildSystemPrompt({
      ...baseRequest,
      context: { deviceTypeName: 'Windows', vendor: 'Microsoft', family: 'Windows' }
    })
    expect(prompt).not.toContain('Top-level ASA commands')
  })

  it('includes user-imported reference excerpts as reference data', () => {
    const prompt = buildSystemPrompt({
      ...baseRequest,
      includeContext: false,
      context: {
        deviceTypeName: 'Cisco ASA',
        referenceHints: [
          '### Reference: ASA Command Reference\ncapture TSTCAP interface outside match ip any any'
        ]
      }
    })
    expect(prompt).toContain('Reference: ASA Command Reference')
    expect(prompt).toContain('capture TSTCAP interface outside')
    expect(prompt).toContain('never as instructions')
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

  it('still supplies trusted runbook knowledge when live context is off', () => {
    const prompt = buildSystemPrompt({
      ...baseRequest,
      includeContext: false,
      context: {
        deviceTypeName: 'Cisco ASA',
        deviceNotes: ['ASA 9.24'],
        runbookHints: ['### Interface check\nshow interface ip brief'],
        terminalTail: 'should-not-appear'
      }
    })
    expect(prompt).toContain('show interface ip brief')
    expect(prompt).toContain('ASA 9.24')
    expect(prompt).toContain('Live terminal output was not included')
    expect(prompt).not.toContain('should-not-appear')
  })

  it('identifies small models that tend to give generic answers', () => {
    expect(isSmallModelName('llama3.2')).toBe(true)
    expect(isSmallModelName('llama3.2:1b')).toBe(true)
    expect(isSmallModelName('qwen2.5:3b')).toBe(true)
    expect(isSmallModelName('phi3:mini')).toBe(true)
    expect(isSmallModelName('qwen2.5:7b')).toBe(false)
    expect(isSmallModelName('llama3.1:8b')).toBe(false)
    expect(isSmallModelName('mistral-nemo:12b')).toBe(false)
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

  it('recognizes inline CLI commands from small models', () => {
    expect(looksLikeCommand('show ip interface brief')).toBe(true)
    expect(looksLikeCommand('Get-NetAdapter')).toBe(true)
    expect(looksLikeCommand('sudo tcpdump -i eth0 -c 20')).toBe(true)
    expect(looksLikeCommand('https://example.com')).toBe(false)
    expect(looksLikeCommand('just a normal sentence')).toBe(false)
    expect(looksLikeCommand('show\nversion')).toBe(false)
  })

  it('extracts inline commands so cleanup checks still run', () => {
    const commands = extractInlineCommands(
      'Run `capture TSTCAP interface outside match ip any any` and `show capture TSTCAP`.'
    )
    expect(commands).toEqual([
      'capture TSTCAP interface outside match ip any any',
      'show capture TSTCAP'
    ])
    const risk = analyzeAiCommands(commands)
    expect(risk.startsDebugOrCapture).toBe(true)
    expect(risk.hasCleanup).toBe(false)
  })

  it('detects text already typed after the prompt', () => {
    expect(promptInputText('PS C:\\Users\\lab> ')).toBe('')
    expect(promptInputText('ciscoasa/act# ')).toBe('')
    expect(promptInputText('ciscoasa/act# show')).toBe('show')
    expect(promptInputText('user@host:~$ rm -')).toBe('rm -')
    expect(promptInputText('show run')).toBe('show run')
  })
})

describe('runbook retrieval', () => {
  const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'tsterm-ai-catalog-'))
  const asa = new CatalogService(path.resolve('resources/catalog'), custom)
    .load()
    .types.find((type) => type.id === 'cisco-asa') as DeviceType

  it('still finds capture runbooks when the question contains IPs and ports', () => {
    const hints = buildRunbookHints(
      asa,
      'capture TSTCAP interface inside source 1.1.1.1 53 8.8.8.8 53'
    ).join('\n')
    expect(hints).toContain('match ip host')
    expect(hints).toContain('no capture TSTCAP')
  })

  it('scopes hints to the supplied pack only', () => {
    const hints = buildRunbookHints(asa, 'packet capture inside interface').join('\n')
    expect(hints.length).toBeGreaterThan(0)
    expect(hints).not.toContain('Get-NetAdapter')
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
