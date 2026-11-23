import { beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_AI_THREAD, useAppStore } from '../src/renderer/src/store'

beforeEach(() => {
  useAppStore.setState({ aiThreads: {} })
})

describe('per-terminal AI threads', () => {
  it('keeps messages and drafts isolated per terminal', () => {
    const store = useAppStore.getState()
    store.setAiThread('pane-a', { draft: 'ASA question' })
    store.setAiThread('pane-b', { draft: 'Windows question' })
    store.setAiThread('pane-a', {
      messages: [
        { role: 'user', content: 'ASA question' },
        { role: 'assistant', content: 'ASA answer' }
      ],
      draft: ''
    })

    const threads = useAppStore.getState().aiThreads
    expect(threads['pane-a'].messages).toHaveLength(2)
    expect(threads['pane-a'].messages[1].content).toBe('ASA answer')
    expect(threads['pane-b'].messages).toHaveLength(0)
    expect(threads['pane-b'].draft).toBe('Windows question')
  })

  it('updates a thread functionally and tracks its own request', () => {
    const store = useAppStore.getState()
    store.setAiThread('pane-a', { draft: 'hello' })
    store.setAiThread('pane-a', (thread) => ({ draft: `${thread.draft}!` }))
    store.setAiThread('pane-a', { busy: true, requestId: 'req-a', streamingText: 'partial' })

    const thread = useAppStore.getState().aiThreads['pane-a']
    expect(thread.draft).toBe('hello!')
    expect(thread.busy).toBe(true)
    expect(thread.requestId).toBe('req-a')
    expect(thread.streamingText).toBe('partial')
  })

  it('deletes one terminal without touching another', () => {
    const store = useAppStore.getState()
    store.setAiThread('pane-a', { draft: 'a' })
    store.setAiThread('pane-b', { draft: 'b' })
    store.deleteAiThread('pane-a')
    expect(useAppStore.getState().aiThreads['pane-a']).toBeUndefined()
    expect(useAppStore.getState().aiThreads['pane-b'].draft).toBe('b')
  })

  it('never mutates the shared empty thread', () => {
    const store = useAppStore.getState()
    store.setAiThread('pane-a', { draft: 'value' })
    expect(EMPTY_AI_THREAD.draft).toBe('')
    expect(EMPTY_AI_THREAD.messages).toHaveLength(0)
    expect(EMPTY_AI_THREAD.busy).toBe(false)
  })
})
