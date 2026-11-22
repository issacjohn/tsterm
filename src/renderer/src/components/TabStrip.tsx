import { useEffect, useRef, useState } from 'react'
import { Laptop, Plus, Server, TerminalSquare, X } from 'lucide-react'
import { useAppStore } from '../store'
import { closeTab, openHostEditor, openLocalTerminal } from '../lib/session-actions'
import { cx, truncate } from '../lib/format'

export function TabStrip(): React.JSX.Element | null {
  const tabs = useAppStore((state) => state.tabs)
  const activeTabId = useAppStore((state) => state.activeTabId)
  const setActiveTab = useAppStore((state) => state.setActiveTab)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  if (!tabs.length) return null

  return (
    <div className="tabstrip">
      <div className="tab-list">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId
          const pane = tab.panes.find((item) => item.id === tab.activePaneId) ?? tab.panes[0]
          const status =
            pane?.status === 'connected'
              ? 'connected'
              : pane?.status === 'error'
                ? 'error'
                : pane?.status === 'disconnected'
                  ? 'disconnected'
                  : 'pending'
          return (
            <div
              key={tab.id}
              className={cx('tab', active && 'active', tab.panes.length > 1 && 'split')}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setActiveTab(tab.id)
                }
              }}
              onAuxClick={(event) => {
                if (event.button === 1) closeTab(tab.id)
              }}
            >
              {pane?.kind === 'local' ? <TerminalSquare size={13} /> : <Server size={13} />}
              <span className={`tab-dot ${status}`} />
              <span className="tab-title">{truncate(tab.title, 28)}</span>
              {tab.panes.length > 1 ? <span className="tab-split-badge">{tab.panes.length}</span> : null}
              <button
                className="tab-close"
                onClick={(event) => {
                  event.stopPropagation()
                  closeTab(tab.id)
                }}
                aria-label={`Close ${tab.title}`}
              >
                <X size={13} />
              </button>
            </div>
          )
        })}
      </div>
      <div className="tab-actions" ref={menuRef}>
        <button
          className="icon-btn tab-add"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="New session"
          title="New session"
        >
          <Plus size={17} />
        </button>
        {menuOpen ? (
          <div className="tab-menu">
            <button
              onClick={() => {
                setMenuOpen(false)
                openHostEditor()
              }}
            >
              <Server size={15} />
              New SSH connection
              <kbd>Ctrl N</kbd>
            </button>
            <button
              onClick={() => {
                setMenuOpen(false)
                openLocalTerminal()
              }}
            >
              <Laptop size={15} />
              Local terminal
              <kbd>Ctrl ⇧ T</kbd>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
