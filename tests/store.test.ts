import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`enc:${value}`, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8').replace(/^enc:/, '')
  }
}))

const { Store } = await import('../src/main/store')

const dirs: string[] = []

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsterm-store-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('settings migration', () => {
  it('adds disabled AI defaults to an existing pre-AI settings file', () => {
    const dir = tempDir()
    fs.writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify({ schemaVersion: 1, appTheme: 'graphite', fontSize: 16 })
    )
    const store = new Store(dir)
    const settings = store.getSettings()
    expect(settings.appTheme).toBe('graphite')
    expect(settings.fontSize).toBe(16)
    expect(settings.aiEnabled).toBe(false)
    expect(settings.aiProfiles.length).toBeGreaterThan(0)
    expect(settings.aiActiveProfileId).toBe(settings.aiProfiles[0].id)
    expect(settings.aiIncludeContext).toBe(true)
    expect(settings.aiAutoPullLocalModels).toBe(true)
  })

  it('sanitizes invalid provider URLs and keeps a usable default', () => {
    const dir = tempDir()
    const store = new Store(dir)
    const settings = store.updateSettings({
      aiProfiles: [
        {
          id: 'bad-provider',
          name: 'Bad',
          kind: 'openai-compatible',
          baseUrl: 'file:///etc/passwd',
          model: 'x',
          authStyle: 'none',
          maxTokens: 100,
          temperature: 0.2,
          local: false
        }
      ]
    })
    expect(settings.aiProfiles.some((profile) => profile.id === 'bad-provider')).toBe(false)
    expect(settings.aiProfiles.length).toBeGreaterThan(0)
    expect(settings.aiActiveProfileId).toBe(settings.aiProfiles[0].id)
  })
})

describe('AI key storage', () => {
  it('encrypts keys at rest and never exposes them in settings', () => {
    const dir = tempDir()
    const store = new Store(dir)
    const settings = store.updateSettings({ aiEnabled: true })
    expect(JSON.stringify(settings)).not.toContain('sk-test-key')

    const persisted = store.saveAiKey('local-ollama', 'sk-test-key')
    expect(persisted).toBe(true)
    expect(store.getAiKey('local-ollama')).toBe('sk-test-key')
    expect(store.getAiKeyIds()).toEqual(['local-ollama'])

    const file = fs.readFileSync(path.join(dir, 'ai-secrets.json'), 'utf8')
    expect(file).not.toContain('sk-test-key')
    const stored = JSON.parse(file).values['local-ollama'] as string
    expect(Buffer.from(stored, 'base64').toString('utf8')).toContain('enc:')

    store.deleteAiKey('local-ollama')
    expect(store.getAiKey('local-ollama')).toBeUndefined()
    expect(store.getAiKeyIds()).toEqual([])
  })

  it('rejects malformed profile ids', () => {
    const store = new Store(tempDir())
    expect(() => store.saveAiKey('../escape', 'key')).toThrow(/Invalid AI profile id/)
    expect(() => store.deleteAiKey('bad id')).toThrow(/Invalid AI profile id/)
  })

  it('caps oversized keys instead of writing them whole', () => {
    const store = new Store(tempDir())
    store.saveAiKey('local-ollama', 'x'.repeat(9000))
    expect(store.getAiKey('local-ollama')?.length).toBe(8192)
  })
})
