import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ReferenceService } from '../src/main/references'

const dirs: string[] = []

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsterm-refs-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

const ASA_TEXT = `
# ASA packet capture

Start a filtered capture on the outside interface.

capture TSTCAP interface outside match ip host 10.1.1.10 host 10.2.2.20
capture TSTCAP buffer 33554432
show capture TSTCAP
no capture TSTCAP

# ASA VPN

show vpn-sessiondb summary
show crypto ikev2 sa
`

const WINDOWS_TEXT = `
# Windows networking

Get-NetAdapter
Get-NetIPConfiguration
Test-NetConnection 10.1.1.1
`

describe('AI reference library', () => {
  it('imports and searches text documents', async () => {
    const base = tempDir()
    const source = path.join(base, 'asa-reference.md')
    fs.writeFileSync(source, ASA_TEXT, 'utf8')
    const service = new ReferenceService(path.join(base, 'data'))
    const result = await service.import(source, 'cisco-asa')
    expect(result.error).toBeUndefined()
    expect(result.docs).toHaveLength(1)
    expect(result.docs[0].deviceTypeId).toBe('cisco-asa')
    expect(result.docs[0].chunks).toBeGreaterThan(0)

    const capture = service.search({
      query: 'packet capture outside interface',
      deviceTypeId: 'cisco-asa'
    })
    expect(capture.ok).toBe(true)
    if (capture.ok) {
      expect(capture.matches.length).toBeGreaterThan(0)
      expect(capture.matches[0].excerpt).toContain('capture TSTCAP')
      expect(capture.matches[0].excerpt).toContain('no capture TSTCAP')
    }

    const vpn = service.search({ query: 'vpn sessiondb', deviceTypeId: 'cisco-asa' })
    expect(vpn.ok).toBe(true)
    if (vpn.ok) expect(vpn.matches.some((match) => match.excerpt.includes('show vpn-sessiondb'))).toBe(true)
  })

  it('scopes documents to a device type', async () => {
    const base = tempDir()
    const asaSource = path.join(base, 'asa.md')
    const winSource = path.join(base, 'windows.md')
    fs.writeFileSync(asaSource, ASA_TEXT, 'utf8')
    fs.writeFileSync(winSource, WINDOWS_TEXT, 'utf8')
    const service = new ReferenceService(path.join(base, 'data'))
    await service.import(asaSource, 'cisco-asa')
    await service.import(winSource, 'windows')

    const asa = service.search({ query: 'adapter ip configuration', deviceTypeId: 'cisco-asa' })
    expect(asa.ok).toBe(true)
    if (asa.ok) expect(asa.matches.some((match) => match.excerpt.includes('Get-NetAdapter'))).toBe(false)

    const windows = service.search({ query: 'adapter ip configuration', deviceTypeId: 'windows' })
    expect(windows.ok).toBe(true)
    if (windows.ok) {
      expect(windows.matches.some((match) => match.excerpt.includes('Get-NetAdapter'))).toBe(true)
      expect(windows.matches.some((match) => match.excerpt.includes('capture TSTCAP'))).toBe(false)
    }
  })

  it('rejects duplicate documents and removes them', async () => {
    const base = tempDir()
    const source = path.join(base, 'asa.md')
    fs.writeFileSync(source, ASA_TEXT, 'utf8')
    const service = new ReferenceService(path.join(base, 'data'))
    const first = await service.import(source)
    expect(first.error).toBeUndefined()
    const second = await service.import(source)
    expect(second.error).toContain('already')

    const docs = service.remove(first.docs[0].id)
    expect(docs).toHaveLength(0)
    expect(service.list()).toHaveLength(0)
  })

  it('imports a text PDF and extracts its content', async () => {
    const base = tempDir()
    const service = new ReferenceService(path.join(base, 'data'))
    const result = await service.import(path.resolve('tests/fixtures/sample.pdf'), 'cisco-asa')
    expect(result.error).toBeUndefined()
    expect(result.docs).toHaveLength(1)
    expect(result.docs[0].fileName).toBe('sample.pdf')
    const search = service.search({ query: 'dummy pdf file', deviceTypeId: 'cisco-asa' })
    expect(search.ok).toBe(true)
    if (search.ok) expect(search.matches.length).toBeGreaterThan(0)
  })

  it('rejects unsupported file types', async () => {
    const base = tempDir()
    const source = path.join(base, 'notes.exe')
    fs.writeFileSync(source, 'not a reference', 'utf8')
    const service = new ReferenceService(path.join(base, 'data'))
    const result = await service.import(source)
    expect(result.error).toContain('Unsupported document type')
  })
})
