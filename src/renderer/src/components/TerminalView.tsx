import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import type { SessionInfo } from '@shared/types'
import { getTerminalTheme } from '@shared/themes'
import { useAppStore } from '../store'
import { terminalDataBus } from '../lib/terminal-bus'
import { terminalRegistry, type TerminalHandle } from '../lib/terminal-registry'
import {
  buildEngine,
  extractCommandForHistory,
  isPasswordPrompt,
  type Suggestion,
  type SuggestionEngine
} from '../lib/suggestions'
import { ghostColor, hexToRgba, toXtermTheme } from '../lib/theme'
import { saveSettings } from '../lib/session-actions'

interface TerminalViewProps {
  session: SessionInfo
  deviceTypeId?: string
  active: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function TerminalView({ session, deviceTypeId, active }: TerminalViewProps): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLSpanElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const engineRef = useRef<SuggestionEngine | null>(null)
  const suggestionRef = useRef<Suggestion | null>(null)
  const ghostVisibleRef = useRef(false)
  const ghostTimerRef = useRef<number | undefined>(undefined)
  const originalCursorRef = useRef<Terminal['options']['cursorStyle']>('bar')
  const historyRef = useRef<string[]>([])
  const settingsRef = useRef(useAppStore.getState().settings)
  const modalOpenRef = useRef(false)

  const settings = useAppStore((state) => state.settings)
  const catalog = useAppStore((state) => state.catalog)
  const snippets = useAppStore((state) => state.snippets)
  const platform = useAppStore((state) => state.appPlatform)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [ghostVisible, setGhostVisible] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchOpenRef = useRef(false)

  settingsRef.current = settings
  searchOpenRef.current = searchOpen

  const setGhost = (visible: boolean): void => {
    if (ghostVisibleRef.current === visible) return
    ghostVisibleRef.current = visible
    setGhostVisible(visible)
    const term = termRef.current
    if (term) {
      if (visible) {
        originalCursorRef.current = term.options.cursorStyle
        term.options.cursorStyle = 'bar'
      } else if (term.options.cursorStyle === 'bar') {
        term.options.cursorStyle = originalCursorRef.current
      }
    }
  }

  const hideGhost = (): void => {
    suggestionRef.current = null
    if (ghostRef.current) {
      ghostRef.current.textContent = ''
      ghostRef.current.style.display = 'none'
    }
    setGhost(false)
  }

  const showGhost = (suggestion: Suggestion): void => {
    const term = termRef.current
    const ghost = ghostRef.current
    const wrap = wrapRef.current
    if (!term || !ghost || !wrap) return
    const buffer = term.buffer.active
    if (buffer.type !== 'normal' || term.hasSelection()) {
      hideGhost()
      return
    }
    const screen = hostRef.current?.querySelector('.xterm-screen') as HTMLElement | null
    if (!screen) return
    const screenRect = screen.getBoundingClientRect()
    const wrapRect = wrap.getBoundingClientRect()
    if (!screenRect.width || !screenRect.height) return
    const cellWidth = screenRect.width / term.cols
    const cellHeight = screenRect.height / term.rows
    const left = screenRect.left - wrapRect.left + buffer.cursorX * cellWidth
    const top = screenRect.top - wrapRect.top + buffer.cursorY * cellHeight
    if (left > wrapRect.width - 4 || buffer.cursorX >= term.cols - 1) {
      hideGhost()
      return
    }
    const theme = getTerminalTheme(settingsRef.current)
    ghost.textContent = suggestion.suffix
    ghost.style.display = 'block'
    ghost.style.transform = `translate(${left}px, ${top}px)`
    ghost.style.fontFamily = term.options.fontFamily ?? settingsRef.current.fontFamily
    ghost.style.fontSize = `${term.options.fontSize ?? settingsRef.current.fontSize}px`
    ghost.style.fontWeight = String(term.options.fontWeight ?? settingsRef.current.fontWeight)
    ghost.style.lineHeight = `${cellHeight}px`
    ghost.style.letterSpacing = `${term.options.letterSpacing ?? 0}px`
    ghost.style.color = ghostColor(theme, settingsRef.current.ghostOpacity)
    suggestionRef.current = suggestion
    setGhost(true)
  }

  const updateGhost = (): void => {
    if (ghostTimerRef.current) window.clearTimeout(ghostTimerRef.current)
    ghostTimerRef.current = window.setTimeout(() => {
      const term = termRef.current
      const engine = engineRef.current
      if (!term || !engine) return
      if (!settingsRef.current.inlineSuggestions || modalOpenRef.current || searchOpenRef.current) {
        hideGhost()
        return
      }
      if (
        document.activeElement !== term.textarea ||
        term.buffer.active.type !== 'normal' ||
        term.hasSelection()
      ) {
        hideGhost()
        return
      }
      const buffer = term.buffer.active
      const line = buffer.getLine(buffer.baseY + buffer.cursorY)
      if (!line) {
        hideGhost()
        return
      }
      const text = line.translateToString(false)
      const before = text.slice(0, buffer.cursorX)
      if (isPasswordPrompt(before)) {
        hideGhost()
        return
      }
      const suggestion = engine.suggest(before)
      if (!suggestion) hideGhost()
      else showGhost(suggestion)
    }, 28)
  }

  const acceptSuggestion = (): void => {
    const suggestion = suggestionRef.current
    if (!suggestion) return
    hideGhost()
    window.tsterm.terminals.write(session.id, suggestion.suffix)
  }

  const captureHistory = (): void => {
    const term = termRef.current
    if (!term) return
    const buffer = term.buffer.active
    const line = buffer.getLine(buffer.baseY + buffer.cursorY)
    if (!line) return
    const command = extractCommandForHistory(line.translateToString(false))
    if (!command) return
    historyRef.current = [command, ...historyRef.current.filter((item) => item !== command)].slice(0, 200)
    engineRef.current?.addHistory(command)
  }

  useEffect(() => {
    const wrap = wrapRef.current
    const host = hostRef.current
    if (!wrap || !host) return
    const initial = useAppStore.getState().settings
    const terminal = new Terminal({
      fontFamily: initial.fontFamily,
      fontSize: initial.fontSize,
      fontWeight: initial.fontWeight as '400',
      lineHeight: initial.lineHeight,
      letterSpacing: initial.letterSpacing,
      cursorStyle: initial.cursorStyle,
      cursorBlink: initial.cursorBlink,
      scrollback: initial.scrollback,
      theme: toXtermTheme(getTerminalTheme(initial)),
      allowProposedApi: true,
      allowTransparency: false,
      convertEol: false,
      drawBoldTextInBrightColors: true,
      minimumContrastRatio: 1,
      smoothScrollDuration: initial.reduceMotion ? 0 : 80,
      rightClickSelectsWord: false,
      macOptionIsMeta: true
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    const unicode = new Unicode11Addon()
    terminal.loadAddon(fit)
    terminal.loadAddon(search)
    terminal.loadAddon(unicode)
    if (initial.clickableLinks) {
      terminal.loadAddon(
        new WebLinksAddon((_event, uri) => {
          void window.tsterm.app.openExternal(uri)
        })
      )
    }
    terminal.open(host)
    try {
      terminal.unicode.activeVersion = '11'
    } catch {
      // ignore
    }
    termRef.current = terminal
    fitRef.current = fit
    searchRef.current = search

    const resize = (): void => {
      try {
        fit.fit()
        window.tsterm.terminals.resize(session.id, terminal.cols, terminal.rows)
      } catch {
        // container may be hidden
      }
      updateGhost()
    }

    const handle: TerminalHandle = {
      terminal,
      fit,
      search,
      clear: () => {
        terminal.clear()
        terminal.focus()
      },
      focus: () => terminal.focus(),
      copySelection: async () => {
        const selection = terminal.getSelection()
        if (!selection) return false
        await window.tsterm.app.copyText(selection)
        terminal.clearSelection()
        return true
      },
      paste: async () => {
        const text = await window.tsterm.app.readClipboard()
        if (text) terminal.paste(text)
        terminal.focus()
      },
      selectAll: () => terminal.selectAll(),
      getSelection: () => terminal.getSelection()
    }
    const unregister = terminalRegistry.register(session.id, handle)

    const dataSub = terminalDataBus.subscribe(session.id, (data) => terminal.write(data))

    terminal.onData((data) => {
      if (data.includes('\r')) captureHistory()
      hideGhost()
      window.tsterm.terminals.write(session.id, data)
      updateGhost()
    })
    terminal.onBinary((data) => {
      window.tsterm.terminals.write(session.id, data)
    })
    terminal.onWriteParsed(() => updateGhost())
    terminal.onCursorMove(() => updateGhost())
    terminal.onScroll(() => updateGhost())
    terminal.onResize(({ cols, rows }) => window.tsterm.terminals.resize(session.id, cols, rows))
    terminal.onSelectionChange(() => {
      if (settingsRef.current.copyOnSelect) {
        const selection = terminal.getSelection()
        if (selection) void window.tsterm.app.copyText(selection)
      }
      updateGhost()
    })

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      const mod = platform === 'darwin' ? event.metaKey : event.ctrlKey
      const current = settingsRef.current
      if (event.key === 'Tab' && !event.shiftKey && suggestionRef.current) {
        event.preventDefault()
        acceptSuggestion()
        return false
      }
      if (event.key === 'ArrowRight' && current.suggestionAcceptKey === 'right' && suggestionRef.current) {
        event.preventDefault()
        acceptSuggestion()
        return false
      }
      if (event.key === 'Escape') {
        hideGhost()
        return true
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        void handle.copySelection()
        return false
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        void handle.paste()
        return false
      }
      if (platform === 'darwin' && mod && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        void handle.copySelection()
        return false
      }
      if (platform === 'darwin' && mod && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        void handle.paste()
        return false
      }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setSearchOpen((open) => !open)
        return false
      }
      if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setSearchOpen(true)
        return false
      }
      if (event.ctrlKey && (event.key === '=' || event.key === '+')) {
        event.preventDefault()
        const size = clamp(current.fontSize + 1, 8, 36)
        terminal.options.fontSize = size
        saveSettings({ fontSize: size })
        requestAnimationFrame(resize)
        return false
      }
      if (event.ctrlKey && event.key === '-') {
        event.preventDefault()
        const size = clamp(current.fontSize - 1, 8, 36)
        terminal.options.fontSize = size
        saveSettings({ fontSize: size })
        requestAnimationFrame(resize)
        return false
      }
      if (event.ctrlKey && event.key === '0') {
        event.preventDefault()
        const size = 14
        terminal.options.fontSize = size
        saveSettings({ fontSize: size })
        requestAnimationFrame(resize)
        return false
      }
      if (event.shiftKey && event.key === 'Insert') {
        event.preventDefault()
        void handle.paste()
        return false
      }
      if (event.ctrlKey && event.key === 'Insert') {
        event.preventDefault()
        void handle.copySelection()
        return false
      }
      return true
    })

    const onContextMenu = (event: MouseEvent): void => {
      if (!settingsRef.current.rightClickPaste) return
      event.preventDefault()
      if (terminal.hasSelection()) {
        void handle.copySelection()
      } else {
        void handle.paste()
      }
    }
    host.addEventListener('contextmenu', onContextMenu)

    const observer = new ResizeObserver(() => {
      if (wrap.clientWidth > 0 && wrap.clientHeight > 0) {
        window.requestAnimationFrame(resize)
      }
    })
    observer.observe(wrap)
    requestAnimationFrame(() => {
      resize()
      if (active) terminal.focus()
    })
    void document.fonts.ready.then(() => {
      resize()
      updateGhost()
    })

    const modalUnsub = useAppStore.subscribe((state, previous) => {
      const open = Boolean(state.modal)
      if (open !== Boolean(previous.modal)) {
        modalOpenRef.current = open
        if (open) hideGhost()
      }
    })

    return () => {
      window.clearTimeout(ghostTimerRef.current)
      observer.disconnect()
      host.removeEventListener('contextmenu', onContextMenu)
      dataSub()
      unregister()
      modalUnsub()
      terminal.dispose()
      termRef.current = null
      fitRef.current = null
      searchRef.current = null
      suggestionRef.current = null
    }
    // The terminal is intentionally rebuilt only when the session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  useEffect(() => {
    const terminal = termRef.current
    if (!terminal) return
    terminal.options.fontFamily = settings.fontFamily
    terminal.options.fontSize = settings.fontSize
    terminal.options.fontWeight = settings.fontWeight as '400'
    terminal.options.lineHeight = settings.lineHeight
    terminal.options.letterSpacing = settings.letterSpacing
    terminal.options.cursorStyle = settings.cursorStyle
    terminal.options.cursorBlink = settings.cursorBlink
    terminal.options.scrollback = settings.scrollback
    terminal.options.theme = toXtermTheme(getTerminalTheme(settings))
    originalCursorRef.current = settings.cursorStyle
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
        window.tsterm.terminals.resize(session.id, terminal.cols, terminal.rows)
      } catch {
        // ignore
      }
      updateGhost()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.fontFamily,
    settings.fontSize,
    settings.fontWeight,
    settings.lineHeight,
    settings.letterSpacing,
    settings.cursorStyle,
    settings.cursorBlink,
    settings.scrollback,
    settings.terminalThemeId,
    settings.customTerminalTheme,
    settings.ghostOpacity
  ])

  useEffect(() => {
    const type = catalog.types.find((item) => item.id === deviceTypeId)
    const engine = buildEngine(type, historyRef.current, platform)
    for (const snippet of snippets) {
      if (!snippet.deviceTypeId || snippet.deviceTypeId === deviceTypeId) engine.addCommand(snippet.command, 6)
    }
    engineRef.current = engine
    hideGhost()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceTypeId, catalog, snippets, platform])

  useEffect(() => {
    if (active) {
      const terminal = termRef.current
      if (terminal) {
        requestAnimationFrame(() => {
          terminal.focus()
          try {
            fitRef.current?.fit()
          } catch {
            // ignore
          }
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen])

  useEffect(() => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<{ sessionId?: string }>).detail
      if (detail?.sessionId === session.id) setSearchOpen(true)
    }
    window.addEventListener('tsterm:find', handler as EventListener)
    return () => window.removeEventListener('tsterm:find', handler as EventListener)
  }, [session.id])

  const runSearch = (backwards = false): void => {
    if (!searchQuery) return
    if (backwards) {
      searchRef.current?.findPrevious(searchQuery, { incremental: true, caseSensitive: false })
    } else {
      searchRef.current?.findNext(searchQuery, { incremental: true, caseSensitive: false })
    }
  }

  const theme = getTerminalTheme(settings)

  return (
    <div className="terminal-wrap" ref={wrapRef} style={{ background: theme.background }}>
      <div className="terminal-host" ref={hostRef} />
      <span className="terminal-ghost" ref={ghostRef} aria-hidden="true" />
      {ghostVisible && (
        <div className="ghost-hint" aria-hidden="true">
          <kbd>Tab</kbd> accept suggestion
        </div>
      )}
      {searchOpen && (
        <div className="terminal-search">
          <Search size={14} />
          <input
            ref={searchInputRef}
            value={searchQuery}
            placeholder="Find in terminal"
            onChange={(event) => {
              setSearchQuery(event.target.value)
              searchRef.current?.findNext(event.target.value, { incremental: true, caseSensitive: false })
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                runSearch(event.shiftKey)
              } else if (event.key === 'Escape') {
                event.preventDefault()
                setSearchOpen(false)
                termRef.current?.focus()
              }
            }}
          />
          <button className="icon-btn tiny" title="Previous match" onClick={() => runSearch(true)}>
            <ChevronUp size={14} />
          </button>
          <button className="icon-btn tiny" title="Next match" onClick={() => runSearch(false)}>
            <ChevronDown size={14} />
          </button>
          <button
            className="icon-btn tiny"
            title="Close search"
            onClick={() => {
              setSearchOpen(false)
              termRef.current?.focus()
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div
        className="terminal-scanline"
        aria-hidden="true"
        style={{ background: `linear-gradient(90deg, transparent, ${hexToRgba(theme.cursor, 0.09)}, transparent)` }}
      />
    </div>
  )
}
