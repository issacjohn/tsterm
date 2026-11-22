import { describe, expect, it } from 'vitest'
import {
  extractCommandForHistory,
  SuggestionEngine
} from '../src/renderer/src/lib/suggestions'

function engine(): SuggestionEngine {
  return new SuggestionEngine({
    commands: [
      'debug radius all',
      'debug crypto ikev2 protocol 255',
      'show ip bgp summary',
      'show version',
      'show interface ip brief'
    ],
    common: ['debug', 'show'],
    history: ['show logging']
  })
}

describe('inline suggestions', () => {
  it('completes a partial command after a Cisco prompt', () => {
    const suggestion = engine().suggest('ciscoasa# deb')
    expect(suggestion?.word).toBe('debug')
    expect(suggestion?.suffix).toBe('ug')
  })

  it('predicts the next word after a space', () => {
    const suggestion = engine().suggest('ciscoasa# show ip ')
    expect(suggestion?.word).toBe('bgp')
    expect(suggestion?.suffix).toBe('bgp')
  })

  it('completes the next word mid-token', () => {
    const suggestion = engine().suggest('ciscoasa# show ip b')
    expect(suggestion?.word).toBe('bgp')
    expect(suggestion?.suffix).toBe('gp')
  })

  it('never suggests at a password prompt', () => {
    expect(engine().suggest('Password: hunter2')).toBeNull()
    expect(engine().suggest('Enter passphrase: abc')).toBeNull()
  })

  it('uses recent commands', () => {
    const suggestion = engine().suggest('ciscoasa# show log')
    expect(suggestion?.word).toBe('logging')
    expect(suggestion?.suffix).toBe('ging')
  })

  it('strips a shell prompt from history entries', () => {
    expect(extractCommandForHistory('user@host:~$ show ip route')).toBe('show ip route')
    expect(extractCommandForHistory('admin@PA-VM> show system resources')).toBe('show system resources')
    expect(extractCommandForHistory('Password: secret')).toBeNull()
  })
})
