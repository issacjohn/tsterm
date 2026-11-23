import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CatalogService } from '../src/main/catalog'
import {
  buildRunbook,
  initialValues,
  runbookCleanupCommands,
  runbookCommands,
  searchWorkflows,
  validateValues
} from '../src/shared/catalog-utils'

const bundled = path.resolve('resources/catalog')
const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'tsterm-custom-'))

describe('bundled catalog', () => {
  const service = new CatalogService(bundled, custom)
  const bundle = service.load()

  it('loads every pack without errors', () => {
    const errors = bundle.issues.filter((issue) => issue.severity === 'error')
    if (errors.length) {
      console.error(errors.map((issue) => `${issue.source}: ${issue.message}`).join('\n'))
    }
    expect(errors).toHaveLength(0)
  })

  it('has the expected device families', () => {
    expect(bundle.types.length).toBeGreaterThanOrEqual(11)
    const ids = bundle.types.map((type) => type.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'cisco-asa',
        'cisco-ios',
        'cisco-nxos',
        'cisco-ftd',
        'cisco-fmc',
        'cisco-wlc-aireos',
        'cisco-meraki',
        'paloalto-panos',
        'windows',
        'linux',
        'macos'
      ])
    )
  })

  it('inherits IOS workflows into the 9800 pack', () => {
    const type = bundle.types.find((item) => item.id === 'cisco-9800')
    expect(type).toBeTruthy()
    expect(type!.workflows.some((workflow) => workflow.id === 'epc-host')).toBe(true)
    expect(type!.workflows.some((workflow) => workflow.id === 'wlc-client-detail')).toBe(true)
  })

  it('searches across names, keywords, and commands', () => {
    const asa = bundle.types.find((type) => type.id === 'cisco-asa')!
    const hits = searchWorkflows(asa, 'radius debugs')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some((hit) => hit.workflow.id.includes('radius'))).toBe(true)
    const capture = searchWorkflows(asa, 'packet capture')
    expect(capture.length).toBeGreaterThan(0)
  })

  it('builds a valid RADIUS runbook and keeps cleanup separate', () => {
    const asa = bundle.types.find((type) => type.id === 'cisco-asa')!
    const workflow = asa.workflows.find((item) => item.id === 'radius-all')!
    const values = initialValues(workflow)
    expect(validateValues(workflow, values)).toEqual({})
    const runbook = buildRunbook(workflow, values)
    expect(runbookCommands(runbook)).toContain('debug radius all')
    expect(runbookCleanupCommands(runbook)).toContain('undebug radius all')
  })

  it('renders conditional windows without an empty optional argument', () => {
    const windows = bundle.types.find((type) => type.id === 'windows')!
    const workflow = windows.workflows.find((item) => item.id === 'dns-check')!
    const withoutServer = buildRunbook(workflow, {
      name: 'example.com',
      dns_server: ''
    })
    expect(withoutServer.primary.map((step) => step.command)).not.toContain(
      'Resolve-DnsName example.com -Server '
    )
    const withServer = buildRunbook(workflow, {
      name: 'example.com',
      dns_server: '1.1.1.1'
    })
    expect(withServer.primary.some((step) => step.command === 'Resolve-DnsName example.com -Server 1.1.1.1')).toBe(true)
  })

  it('requires cleanup on debug and capture workflows', () => {
    for (const type of bundle.types) {
      for (const workflow of type.workflows) {
        if (workflow.effect === 'debug' || workflow.effect === 'capture') {
          expect(workflow.cleanup.some((step) => Boolean(step.command)), `${type.id}/${workflow.id}`).toBe(true)
        }
      }
    }
  })

  it('ships the expanded ASA troubleshooting library', () => {
    const asa = bundle.types.find((type) => type.id === 'cisco-asa')!
    expect(asa.workflows).toHaveLength(77)
    expect(asa.categories).toHaveLength(14)
    expect(asa.workflows.some((workflow) => workflow.id === 'capture-asp-drop')).toBe(true)
    expect(asa.workflows.some((workflow) => workflow.id === 'vpn-session-filter')).toBe(true)
    expect(asa.workflows.some((workflow) => workflow.id === 'license-status')).toBe(true)
    expect(asa.workflows.some((workflow) => workflow.id === 'tech-support')).toBe(true)
    const total = bundle.types.reduce((count, type) => count + type.workflows.length, 0)
    expect(total).toBe(236)
  })

  it('uses the ASA capture syntax verified on the lab device', () => {
    const asa = bundle.types.find((type) => type.id === 'cisco-asa')!
    for (const workflow of asa.workflows.filter((item) => item.effect === 'capture')) {
      const commands = workflow.steps
        .map((step) => step.command)
        .filter((command): command is string => Boolean(command))
      expect(commands.some((command) => command.includes('buffer bytes')), workflow.id).toBe(false)
      expect(commands.some((command) => command === 'capture TSTCAP buffer 33554432'), workflow.id).toBe(true)
      if (workflow.id === 'capture-acl' || workflow.id === 'capture-vpn-esp') {
        expect(commands.some((command) => command.startsWith('capture TSTCAP interface') && command.includes('access-list TSTCAP_ACL')), workflow.id).toBe(true)
        expect(commands.some((command) => command.includes('match access-list')), workflow.id).toBe(false)
        expect(
          workflow.cleanup.some((step) => step.command === 'clear configure access-list TSTCAP_ACL'),
          workflow.id
        ).toBe(true)
      }
    }
  })

  it('uses tested undebug cleanup for ASA debugs', () => {
    const asa = bundle.types.find((type) => type.id === 'cisco-asa')!
    for (const workflow of asa.workflows.filter((item) => item.effect === 'debug')) {
      for (const step of workflow.cleanup) {
        if (step.command && /^no debug/.test(step.command)) {
          throw new Error(`${workflow.id} still uses '${step.command}' instead of undebug`)
        }
      }
    }
  })
})
