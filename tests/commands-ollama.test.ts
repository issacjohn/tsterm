import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CommandService } from '../src/main/commands'
import { DEFAULT_SETTINGS } from '../src/shared/themes'
import type { CommandIndexProgress } from '../src/shared/types'
import type { Store } from '../src/main/store'

const COMMANDS_DIR = path.join(process.cwd(), 'resources', 'commands')
const enabled = process.env.TSTERM_OLLAMA_TEST === '1'

function service(model?: string): CommandService {
  const profile = structuredClone(DEFAULT_SETTINGS.aiProfiles[0])
  if (model) profile.model = model
  const settings = {
    ...structuredClone(DEFAULT_SETTINGS),
    aiEnabled: true,
    aiProfiles: [profile],
    aiActiveProfileId: profile.id
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsterm-ollama-commands-'))
  const store = {
    paths: { appData: dir },
    getSettings: () => structuredClone(settings),
    warnings: []
  } as unknown as Store
  return new CommandService(store, COMMANDS_DIR)
}

describe.skipIf(!enabled)('hybrid retrieval with local Ollama', () => {
  it(
    'builds the embedding index and returns hybrid matches',
    { timeout: 600_000 },
    async () => {
      const commands = service()
      const progress: CommandIndexProgress[] = []
      const status = await commands.buildVectorIndex(undefined, (event) => progress.push(event))
      expect(status.vectorError).toBeUndefined()
      expect(status.vectorReady).toBe(true)
      expect(status.vectorCount).toBe(status.vectorTargetCount)
      expect(status.vectorCount).toBeLessThan(status.total)
      expect(progress.at(-1)?.phase).toBe('done')

      const questions = [
        {
          query: 'vpn tunnel will not come up',
          expected: /show crypto (ikev|ipsec|isakmp)|show vpn-sessiondb/
        },
        {
          query: 'users cannot authenticate through radius',
          expected: /aaa-server|radius/
        },
        {
          query: 'certificate looks expired',
          expected: /crypto ca certificates|crypto ca trustpoint/
        },
        {
          query: 'interface is dropping packets',
          expected: /show interface|capture/
        }
      ]

      for (const question of questions) {
        const result = await commands.search({ query: question.query, limit: 5 })
        expect(result.vectorReady).toBe(true)
        const commandsText = result.matches
          .map((match) => match.record.commandTemplate)
          .join('\n')
        expect(commandsText).toMatch(question.expected)
      }
    }
  )

  it(
    'routes a host-to-host capture without inventing values',
    { timeout: 180_000 },
    async () => {
      const commands = service('qwen3:8b')
      const result = await commands.route({
        query:
          'Run a packet capture on the outside interface for host 10.1.1.1 talking to 8.8.8.8'
      })
      expect(result.error).toBeUndefined()
      expect(result.ok).toBe(true)
      expect(result.selected?.id).toMatch(/capture-host/)
      expect(result.missing).toEqual([])
      expect(result.rendered).toBe(
        'capture TSTCAP interface outside match ip host 10.1.1.1 host 8.8.8.8'
      )
    }
  )

  it(
    'routes a RADIUS question to an AAA command',
    { timeout: 180_000 },
    async () => {
      const commands = service('qwen3:8b')
      const result = await commands.route({
        query:
          'Users cannot authenticate to the VPN through RADIUS. Which command shows the AAA server state?'
      })
      expect(result.error).toBeUndefined()
      expect(result.ok).toBe(true)
      expect(result.selected?.commandTemplate).toMatch(/aaa-server|radius/i)
    }
  )

  it(
    'keeps a destructive request in the destructive risk class',
    { timeout: 180_000 },
    async () => {
      const commands = service('qwen3:8b')
      const result = await commands.route({
        query: 'Delete the running configuration and reload the appliance now'
      })
      expect(result.error).toBeUndefined()
      expect(result.ok).toBe(true)
      expect(result.selected?.risk).toBe('destructive')
    }
  )
})
