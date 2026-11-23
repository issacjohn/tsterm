import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommandService } from '../src/main/commands'
import { DEFAULT_SETTINGS } from '../src/shared/themes'
import { renderCommand, validateParameter } from '../src/shared/command-utils'
import type { AppSettings, AsaCommandRecord } from '../src/shared/types'
import type { Store } from '../src/main/store'

const COMMANDS_DIR = path.join(process.cwd(), 'resources', 'commands')

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tsterm-commands-'))
}

function fakeStore(overrides: Partial<AppSettings> = {}): Store {
  const settings: AppSettings = {
    ...structuredClone(DEFAULT_SETTINGS),
    aiProfiles: [],
    aiActiveProfileId: undefined,
    ...overrides
  }
  return {
    paths: { appData: tempDir() },
    getSettings: () => structuredClone(settings),
    warnings: []
  } as unknown as Store
}

function service(overrides: Partial<AppSettings> = {}): CommandService {
  return new CommandService(fakeStore(overrides), COMMANDS_DIR)
}

function serviceWithOllama(): CommandService {
  const profile = structuredClone(DEFAULT_SETTINGS.aiProfiles[0])
  return service({
    aiEnabled: true,
    aiProfiles: [profile],
    aiActiveProfileId: profile.id
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('command catalog', () => {
  it('loads the generated ASA catalog', () => {
    const commands = service()
    const status = commands.status()
    expect(status.total).toBeGreaterThan(400)
    expect(status.vectorReady).toBe(false)
    expect(status.vectorModel).toBe('nomic-embed-text')
    expect(commands.getWarnings()).toHaveLength(0)
  })

  it('loads the Cisco documentation reference but keeps it out of routing pools', async () => {
    const commands = service()
    const status = commands.status()
    expect(status.total).toBeGreaterThan(status.vectorTargetCount + 1000)

    const docs = await commands.search({
      query: 'aaa accounting command',
      limit: 10,
      useVector: false
    })
    expect(
      docs.matches.some((match) => match.record.referenceOnly && match.record.source === 'cisco-docs')
    ).toBe(true)

    const curatedOnly = await commands.search({
      query: 'aaa accounting command',
      limit: 10,
      useVector: false,
      includeReference: false
    })
    expect(curatedOnly.matches.every((match) => !match.record.referenceOnly)).toBe(true)
  })

  it('finds capture commands for a natural-language symptom', async () => {
    const commands = service()
    const result = await commands.search({
      query: 'capture traffic between two hosts',
      limit: 5,
      useVector: false,
      includeReference: false
    })
    expect(result.matches.length).toBeGreaterThan(0)
    expect(
      result.matches.some((match) => /^capture\s/i.test(match.record.commandTemplate))
    ).toBe(true)
    expect(result.vectorReady).toBe(false)
  })

  it('classifies each command by what it actually does', async () => {
    const commands = service()
    const cases: Array<[string, (record: AsaCommandRecord) => boolean, string]> = [
      [
        'capture TSTCAP interface outside match ip host 10.1.1.1 host 8.8.8.8',
        (record) =>
          record.id.startsWith('asa.rb.capture-host.') &&
          record.commandTemplate.startsWith('capture TSTCAP'),
        'diagnostic'
      ],
      [
        'show capture TSTCAP',
        (record) => record.commandTemplate === 'show capture TSTCAP',
        'read_only'
      ],
      [
        'configure terminal',
        (record) => record.commandTemplate === 'configure terminal',
        'mutating'
      ],
      [
        'clear configure access-list TSTCAP_ACL',
        (record) => record.commandTemplate.startsWith('clear configure access-list'),
        'mutating'
      ],
      [
        'reload',
        (record) => record.id === 'asa.cmd.reload',
        'destructive'
      ]
    ]
    for (const [query, matches, risk] of cases) {
      const result = await commands.search({
        query,
        limit: 50,
        useVector: false,
        includeReference: false
      })
      const record = result.matches.find((match) => matches(match.record))?.record
      expect(record, `${query} should retrieve a matching curated record`).toBeTruthy()
      expect(record?.risk).toBe(risk)
    }
  })

  it('does not return an incomplete top-level command for a symptom question', async () => {
    const commands = service()
    const result = await commands.search({
      query: 'capture traffic between two hosts',
      limit: 10,
      useVector: false,
      includeReference: false
    })
    expect(result.matches.some((match) => match.record.id === 'asa.cmd.capture')).toBe(false)
  })

  it('finds show commands and respects the risk filter', async () => {
    const commands = service()
    const result = await commands.search({
      query: 'show interface ip brief',
      risk: 'read_only',
      limit: 10,
      useVector: false,
      includeReference: false
    })
    expect(result.matches.length).toBeGreaterThan(0)
    expect(result.matches.every((match) => match.record.risk === 'read_only')).toBe(true)
    expect(
      result.matches.some((match) => match.record.commandTemplate.toLowerCase().includes('show'))
    ).toBe(true)
  })

  it('explains an unmapped syslog ID instead of returning random commands', async () => {
    const commands = service()
    const result = await commands.search({ query: '%ASA-4-106023', useVector: false })
    expect(result.matches).toEqual([])
    expect(result.note).toMatch(/syslog/i)
  })

  it('reports candidates when AI is not configured', async () => {
    const commands = service()
    const result = await commands.route({
      query: 'capture traffic from 10.1.1.1 to 8.8.8.8 on the outside interface'
    })
    expect(result.ok).toBe(false)
    expect(result.candidates.length).toBeGreaterThan(0)
    expect(result.error).toMatch(/AI assistant is off|Ollama|provider/i)
  })
})

describe('deterministic renderer', () => {
  const record: AsaCommandRecord = {
    id: 'test.capture',
    vendor: 'cisco-asa',
    commandTemplate: 'capture TSTCAP interface {iface} match ip host {src} host {dst}',
    description: 'Test capture',
    category: 'capture',
    mode: 'privileged EXEC',
    risk: 'diagnostic',
    keywords: [],
    parameters: [
      { name: 'iface', required: true, regex: '^[A-Za-z][A-Za-z0-9/_.:-]*$' },
      {
        name: 'src',
        required: true,
        regex: '^\\d{1,3}(\\.\\d{1,3}){3}$'
      },
      {
        name: 'dst',
        required: true,
        regex: '^\\d{1,3}(\\.\\d{1,3}){3}$'
      }
    ],
    examples: [],
    cleanup: ['no capture TSTCAP'],
    source: 'runbook',
    version: '9.24'
  }

  it('renders exactly from the template and values', () => {
    const result = renderCommand(record, {
      iface: 'outside',
      src: '10.1.1.1',
      dst: '8.8.8.8'
    })
    expect(result.ok).toBe(true)
    expect(result.command).toBe(
      'capture TSTCAP interface outside match ip host 10.1.1.1 host 8.8.8.8'
    )
  })

  it('reports missing required values instead of inventing them', () => {
    const result = renderCommand(record, { iface: 'outside' })
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(['src', 'dst'])
  })

  it('rejects values that do not match the parameter rule', () => {
    expect(validateParameter(record.parameters[1], '8.8.8.8; reload')).toMatch(/format/)
    expect(validateParameter(record.parameters[1], '8.8.8.8')).toBeNull()
  })

  it('rejects whitespace and help characters even when a record has no regex', () => {
    const loose = { name: 'name', required: true }
    expect(validateParameter(loose, 'outside reload')).toMatch(/spaces/)
    expect(validateParameter(loose, 'outside?')).toMatch(/help/)
    expect(validateParameter(loose, 'outside')).toBeNull()
  })
})

describe('AI router contract', () => {
  const query = 'capture TSTCAP interface outside match ip host 10.1.1.1 host 8.8.8.8'

  async function findCandidate(commands: CommandService): Promise<AsaCommandRecord> {
    const result = await commands.search({
      query,
      limit: 50,
      useVector: false,
      includeReference: false
    })
    const record = result.matches.find((match) =>
      match.record.id.startsWith('asa.rb.capture-host.')
    )?.record
    if (!record) throw new Error('capture-host record missing from the catalog.')
    return record
  }

  it('renders only values the model extracted from the request', async () => {
    const commands = serviceWithOllama()
    const candidate = await findCandidate(commands)
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              command_id: candidate.id,
              params: { iface: 'outside', src: '10.1.1.1', dst: '8.8.8.8' },
              missing_required_params: [],
              confidence: 'high',
              reasoning: 'The request names a capture and both hosts.'
            })
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await commands.route({ query, profileId: 'local-ollama' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
    expect(result.selected?.id).toBe(candidate.id)
    expect(result.rendered).toBe(
      'capture TSTCAP interface outside match ip host 10.1.1.1 host 8.8.8.8'
    )
    expect(result.missing).toEqual([])
  })

  it('rejects a candidate ID that was not retrieved and retries once', async () => {
    const commands = serviceWithOllama()
    const candidate = await findCandidate(commands)
    const invalid = JSON.stringify({
      command_id: 'asa.cmd.not-a-real-command',
      params: {},
      missing_required_params: [],
      confidence: 'high',
      reasoning: 'Invented a command.'
    })
    const valid = JSON.stringify({
      command_id: candidate.id,
      params: { iface: 'outside', src: '10.1.1.1', dst: '8.8.8.8' },
      missing_required_params: [],
      confidence: 'high',
      reasoning: 'The request names a capture and both hosts.'
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: { content: invalid } }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: { content: valid } }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await commands.route({ query, profileId: 'local-ollama' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(true)
    expect(result.selected?.id).toBe(candidate.id)
  })

  it('refuses after a second invalid candidate ID', async () => {
    const commands = serviceWithOllama()
    const invalid = JSON.stringify({
      command_id: 'asa.cmd.not-a-real-command',
      params: {},
      missing_required_params: [],
      confidence: 'high',
      reasoning: 'Invented a command.'
    })
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: { content: invalid } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await commands.route({ query, profileId: 'local-ollama' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not in the candidate list/i)
    expect(result.candidates.length).toBeGreaterThan(0)
  })

  it('drops a model value that does not appear in the request', async () => {
    const commands = serviceWithOllama()
    const candidate = await findCandidate(commands)
    const content = JSON.stringify({
      command_id: candidate.id,
      params: { iface: 'outside', src: '9.9.9.9', dst: '8.8.8.8' },
      missing_required_params: [],
      confidence: 'high',
      reasoning: 'Guessed an address.'
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ message: { content } }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
    )

    const result = await commands.route({ query, profileId: 'local-ollama' })
    expect(result.ok).toBe(true)
    expect(result.rendered).toBeUndefined()
    expect(result.missing).toContain('src')
  })
})
