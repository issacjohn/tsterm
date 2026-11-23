import { useEffect, useState } from 'react'
import {
  Activity,
  BellOff,
  Bot,
  BookOpen,
  Check,
  ChevronRight,
  Coffee,
  Database,
  Download,
  ExternalLink,
  FolderOpen,
  Gauge,
  KeyRound,
  Keyboard,
  Loader2,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  Wifi,
  X
} from 'lucide-react'
import type { AiProfile, AppSettings, AppThemeId, TerminalTheme } from '@shared/types'
import { getTerminalTheme, TERMINAL_THEMES } from '@shared/themes'
import { useAppStore, type SettingsTab } from '../../store'
import { saveSettings } from '../../lib/session-actions'
import { ghostColor } from '../../lib/theme'
import { cx } from '../../lib/format'
import { Modal } from '../ui/Modal'

interface ToggleProps {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description?: string
}

function SettingToggle({ checked, onChange, label, description }: ToggleProps): React.JSX.Element {
  return (
    <div className="setting-row">
      <div className="setting-copy">
        <strong>{label}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      <button
        className={cx('switch', checked && 'on')}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  description
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  description?: string
  onChange: (value: number) => void
}): React.JSX.Element {
  return (
    <div className="setting-row setting-row-column">
      <div className="setting-copy slider-label">
        <strong>{label}</strong>
        <span className="slider-value">
          {value}
          {suffix}
        </span>
      </div>
      {description ? <span className="setting-description">{description}</span> : null}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}

function FontField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = (): void => {
    if (draft.trim() && draft !== value) onChange(draft.trim())
  }
  const presets = [
    'Cascadia Code',
    'JetBrains Mono',
    'Fira Code',
    'IBM Plex Mono',
    'Source Code Pro',
    'SF Mono',
    'Menlo',
    'Consolas'
  ]
  return (
    <div className="setting-block">
      <label className="setting-label">{label}</label>
      <div className="font-picker">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
          }}
          spellCheck={false}
        />
        <button className="btn btn-sm" onClick={commit}>
          Apply
        </button>
      </div>
      <div className="font-presets">
        {presets.map((preset) => (
          <button
            key={preset}
            className={cx('font-chip', draft.includes(preset) && 'active')}
            style={{ fontFamily: `"${preset}", monospace` }}
            onClick={() => {
              setDraft(`"${preset}", monospace`)
              onChange(`"${preset}", monospace`)
            }}
          >
            {preset}
          </button>
        ))}
      </div>
      <span className="setting-description">
        Any font installed on this computer works. The fallback is monospace.
      </span>
    </div>
  )
}

function TerminalPreview(): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const theme = getTerminalTheme(settings)
  return (
    <div className="terminal-preview-card">
      <div
        className="terminal-preview-screen"
        style={{
          background: theme.background,
          color: theme.foreground,
          fontFamily: settings.fontFamily,
          fontSize: settings.fontSize,
          lineHeight: settings.lineHeight,
          letterSpacing: settings.letterSpacing
        }}
      >
        <div>
          <span style={{ color: theme.green }}>ciscoasa/act#</span> debug rad
          <span style={{ color: ghostColor(theme, settings.ghostOpacity) }}>ius all</span>
        </div>
        <div style={{ color: theme.brightBlack }}>debug radius all</div>
        <div style={{ color: theme.cyan }}>RADIUS: authenticating user jsmith…</div>
        <div>
          <span style={{ color: theme.green }}>ciscoasa/act#</span>{' '}
          <span className="preview-cursor" style={{ background: theme.cursor }} />
        </div>
      </div>
      <div className="terminal-preview-meta">
        <span>{settings.fontSize}px</span>
        <span>{theme.name}</span>
        <span style={{ color: theme.brightGreen }}>● connected</span>
      </div>
    </div>
  )
}

const APP_THEMES: Array<{ id: AppThemeId; name: string; note: string; colors: string[] }> = [
  { id: 'midnight', name: 'Midnight', note: 'Deep blue-black', colors: ['#0a1016', '#101c24', '#57e6c2'] },
  { id: 'graphite', name: 'Graphite', note: 'Neutral charcoal', colors: ['#101214', '#1a1e22', '#b9f27c'] },
  { id: 'daylight', name: 'Daylight', note: 'Warm light', colors: ['#f4f1ea', '#ffffff', '#147d70'] }
]

function ThemeTile({ theme, active, onClick }: { theme: TerminalTheme; active: boolean; onClick: () => void }): React.JSX.Element {
  return (
    <button className={cx('theme-tile', active && 'active')} onClick={onClick}>
      <span
        className="theme-swatch"
        style={{
          background: theme.background,
          borderColor: theme.selectionBackground
        }}
      >
        <i style={{ background: theme.red }} />
        <i style={{ background: theme.yellow }} />
        <i style={{ background: theme.green }} />
        <i style={{ background: theme.blue }} />
        <i style={{ background: theme.magenta }} />
        <i style={{ background: theme.cyan }} />
      </span>
      <span className="theme-tile-name">
        {theme.name}
        {active ? <Check size={12} /> : null}
      </span>
    </button>
  )
}

interface SettingsModalProps {
  tab?: SettingsTab
  onClose: () => void
}

export function SettingsModal({ tab = 'appearance', onClose }: SettingsModalProps): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const bootstrap = useAppStore((state) => state.bootstrap)
  const catalog = useAppStore((state) => state.catalog)
  const knownHosts = useAppStore((state) => state.knownHosts)
  const debugSessions = useAppStore((state) => state.debugSessions)
  const aiKeyIds = useAppStore((state) => state.aiKeyIds)
  const setCatalog = useAppStore((state) => state.setCatalog)
  const setHosts = useAppStore((state) => state.setHosts)
  const setAiKeyIds = useAppStore((state) => state.setAiKeyIds)
  const setModal = useAppStore((state) => state.setModal)
  const notify = useAppStore((state) => state.notify)
  const [activeTab, setActiveTab] = useState<SettingsTab>(tab)
  const [checking, setChecking] = useState(false)
  const [reloadBusy, setReloadBusy] = useState(false)
  const [updateMessage, setUpdateMessage] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState(false)
  const [profileDraft, setProfileDraft] = useState<AiProfile | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [keyVisible, setKeyVisible] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [modelBusy, setModelBusy] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
  const theme = getTerminalTheme(settings)

  const update = (patch: Partial<AppSettings>): void => saveSettings(patch)

  const activeProfile =
    settings.aiProfiles.find((profile) => profile.id === settings.aiActiveProfileId) ??
    settings.aiProfiles[0]

  useEffect(() => {
    setProfileDraft(activeProfile ? { ...activeProfile } : null)
    setKeyDraft('')
    setKeyVisible(false)
    setModels([])
    setModelError(null)
    // Only reset the editor when the selected provider changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile?.id])

  const patchProfile = (patch: Partial<AiProfile>): void => {
    setProfileDraft((current) => (current ? { ...current, ...patch } : current))
  }

  const profileIsDirty = Boolean(
    profileDraft &&
      activeProfile &&
      (profileDraft.name !== activeProfile.name ||
        profileDraft.kind !== activeProfile.kind ||
        profileDraft.baseUrl !== activeProfile.baseUrl ||
        profileDraft.model !== activeProfile.model ||
        profileDraft.authStyle !== activeProfile.authStyle ||
        profileDraft.maxTokens !== activeProfile.maxTokens ||
        profileDraft.temperature !== activeProfile.temperature)
  )

  const saveProfile = (): void => {
    if (!profileDraft) return
    let parsed: URL
    try {
      parsed = new URL(profileDraft.baseUrl.trim())
    } catch {
      notify({ kind: 'error', title: 'Invalid base URL', message: 'Use a full http:// or https:// URL.' })
      return
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      notify({ kind: 'error', title: 'Invalid base URL', message: 'AI provider URLs must use http or https.' })
      return
    }
    if (!profileDraft.name.trim()) {
      notify({ kind: 'warning', title: 'Name required', message: 'Give this provider a name.' })
      return
    }
    const next: AiProfile = {
      ...profileDraft,
      name: profileDraft.name.trim().slice(0, 80),
      baseUrl: profileDraft.baseUrl.trim().replace(/\/+$/, ''),
      model: profileDraft.model.trim().slice(0, 200),
      maxTokens: Math.min(8192, Math.max(64, Math.round(profileDraft.maxTokens) || 1024)),
      temperature: Math.min(2, Math.max(0, Number(profileDraft.temperature) || 0)),
      local: ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
    }
    update({
      aiProfiles: settings.aiProfiles.map((profile) => (profile.id === next.id ? next : profile))
    })
    setProfileDraft(next)
    notify({ kind: 'success', title: 'Provider saved', message: next.name })
  }

  const addProfile = (): void => {
    const id = `custom-${Date.now().toString(36)}`
    const profile: AiProfile = {
      id,
      name: 'Custom provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      model: '',
      authStyle: 'bearer',
      maxTokens: 1024,
      temperature: 0.2,
      local: false
    }
    update({ aiProfiles: [...settings.aiProfiles, profile], aiActiveProfileId: id })
  }

  const removeProfile = (): void => {
    if (!activeProfile || settings.aiProfiles.length <= 1) return
    if (!window.confirm(`Remove the provider "${activeProfile.name}"?\n\nThe saved API key is not deleted automatically.`)) return
    const remaining = settings.aiProfiles.filter((profile) => profile.id !== activeProfile.id)
    update({ aiProfiles: remaining, aiActiveProfileId: remaining[0]?.id })
  }

  const saveKey = async (): Promise<void> => {
    if (!activeProfile || !keyDraft.trim()) return
    try {
      const ids = await window.tsterm.ai.saveKey(activeProfile.id, keyDraft.trim())
      setAiKeyIds(ids)
      setKeyDraft('')
      setKeyVisible(false)
      notify({
        kind: 'success',
        title: 'API key saved',
        message: 'It is encrypted with the operating system keychain and never shown again.'
      })
    } catch (error) {
      notify({ kind: 'error', title: 'Could not save key', message: (error as Error).message })
    }
  }

  const removeKey = async (): Promise<void> => {
    if (!activeProfile) return
    try {
      const ids = await window.tsterm.ai.deleteKey(activeProfile.id)
      setAiKeyIds(ids)
      notify({ kind: 'info', title: 'API key removed' })
    } catch (error) {
      notify({ kind: 'error', title: 'Could not remove key', message: (error as Error).message })
    }
  }

  const fetchModels = async (): Promise<void> => {
    if (!profileDraft) return
    setModelBusy(true)
    setModelError(null)
    setModels([])
    try {
      const result = await window.tsterm.ai.listModels({
        profile: profileDraft,
        apiKey: keyDraft.trim() || undefined
      })
      if (result.ok) {
        setModels(result.models)
        if (!profileDraft.model && result.models[0]) patchProfile({ model: result.models[0] })
      } else {
        setModelError(result.error)
      }
    } catch (error) {
      setModelError((error as Error).message)
    } finally {
      setModelBusy(false)
    }
  }

  const navItems: Array<{ id: SettingsTab; label: string; icon: typeof Palette }> = [
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'terminal', label: 'Terminal', icon: Terminal },
    { id: 'suggestions', label: 'Typing', icon: Sparkles },
    { id: 'sessions', label: 'Sessions', icon: Wifi },
    { id: 'ai', label: 'AI assistant', icon: Bot },
    { id: 'data', label: 'Data & packs', icon: Database },
    { id: 'about', label: 'About', icon: BookOpen }
  ]

  const resetDefaults = (): void => {
    if (
      !window.confirm(
        'Reset every appearance, session, and AI provider setting to its default?\n\nAI turns off. Hosts, snippets, device packs, and saved API keys are not affected.'
      )
    ) {
      return
    }
    void window.tsterm.settings.reset().then((fresh) => useAppStore.getState().setSettings(fresh))
    notify({ kind: 'info', title: 'Settings reset', message: 'Defaults restored.' })
  }

  const checkUpdates = async (): Promise<void> => {
    setChecking(true)
    setUpdateMessage(null)
    setUpdateError(false)
    try {
      const result = await window.tsterm.updates.check(true)
      if (result.available && result.update) {
        setModal({ kind: 'update', info: result.update, manual: true })
      } else {
        setUpdateMessage(
          result.reason || `You are on the latest version (${bootstrap?.appVersion ?? '0.1.0'}).`
        )
      }
    } catch (error) {
      setUpdateError(true)
      setUpdateMessage((error as Error).message)
    } finally {
      setChecking(false)
    }
  }

  const importPack = async (): Promise<void> => {
    setReloadBusy(true)
    try {
      const result = await window.tsterm.catalog.importCustom()
      if (result?.ok && result.bundle) {
        setCatalog(result.bundle)
        notify({ kind: 'success', title: 'Device pack imported' })
      } else if (result && !result.ok) {
        notify({ kind: 'error', title: 'Import failed', message: result.errors?.[0] })
      }
    } finally {
      setReloadBusy(false)
    }
  }

  const reloadCatalog = async (): Promise<void> => {
    setReloadBusy(true)
    try {
      const bundle = await window.tsterm.catalog.reload()
      setCatalog(bundle)
      const errors = bundle.issues.filter((issue) => issue.severity === 'error').length
      notify({
        kind: errors ? 'warning' : 'success',
        title: errors ? `Catalog reloaded with ${errors} error${errors === 1 ? '' : 's'}` : 'Catalog reloaded',
        message: `${bundle.types.length} device packs are available.`,
        duration: 4000
      })
    } finally {
      setReloadBusy(false)
    }
  }

  const importHosts = async (): Promise<void> => {
    const result = await window.tsterm.hosts.importHosts()
    setHosts(result.hosts)
    if (result.imported) {
      notify({ kind: 'success', title: `Imported ${result.imported} host${result.imported === 1 ? '' : 's'}` })
    }
  }

  const setCustomColor = (key: 'background' | 'foreground' | 'cursor' | 'selectionBackground', value: string): void => {
    const base = settings.terminalThemeId === 'custom' && settings.customTerminalTheme
      ? settings.customTerminalTheme
      : { ...theme, id: 'custom', name: 'Custom' }
    const next: TerminalTheme = { ...base, id: 'custom', name: 'Custom', [key]: value }
    update({ terminalThemeId: 'custom', customTerminalTheme: next })
  }

  return (
    <Modal
      title="Settings"
      description="Everything is stored locally. Credentials use the operating system keychain."
      icon={<Gauge size={20} />}
      size="xl"
      onClose={onClose}
      className="settings-modal"
      footer={
        <>
          <div className="modal-footer-left">
            <button className="btn btn-ghost btn-sm" onClick={resetDefaults}>
              <RotateCcw size={14} /> Reset defaults
            </button>
          </div>
          <div className="modal-footer-actions">
            <button className="btn" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      }
    >
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={activeTab === item.id ? 'active' : ''}
                onClick={() => setActiveTab(item.id)}
              >
                <Icon size={15} />
                {item.label}
                <ChevronRight size={13} />
              </button>
            )
          })}
          <div className="settings-nav-foot">
            <button onClick={() => setModal({ kind: 'help' })}>
              <Keyboard size={14} /> Shortcuts
            </button>
            <button onClick={() => void window.tsterm.app.openExternal('https://buymeacoffee.com/issac_john')}>
              <Coffee size={14} /> Buy me a coffee
            </button>
          </div>
        </nav>

        <div className="settings-content">
          {activeTab === 'appearance' ? (
            <div className="settings-section">
              <div className="settings-heading">
                <h3>Workspace look</h3>
                <p>Choose the shell around your terminal. The terminal palette is separate.</p>
              </div>
              <div className="app-theme-grid">
                {APP_THEMES.map((option) => (
                  <button
                    key={option.id}
                    className={cx('app-theme-card', settings.appTheme === option.id && 'active')}
                    onClick={() => update({ appTheme: option.id })}
                  >
                    <span className="app-theme-preview" style={{ background: option.colors[0] }}>
                      <span style={{ background: option.colors[1] }} />
                      <i style={{ background: option.colors[2] }} />
                    </span>
                    <span>
                      <strong>{option.name}</strong>
                      <small>{option.note}</small>
                    </span>
                    {settings.appTheme === option.id ? <Check size={14} /> : null}
                  </button>
                ))}
              </div>
              <Slider label="Interface scale" value={Math.round(settings.uiScale * 100)} min={85} max={120} step={5} suffix="%" onChange={(value) => update({ uiScale: value / 100 })} />
              <div className="segmented-row">
                <div className="setting-copy">
                  <strong>Density</strong>
                  <span>Comfortable spacing or a tighter tool layout.</span>
                </div>
                <div className="segmented">
                  {(['comfortable', 'compact'] as const).map((density) => (
                    <button
                      key={density}
                      className={settings.density === density ? 'active' : ''}
                      onClick={() => update({ density })}
                    >
                      {density}
                    </button>
                  ))}
                </div>
              </div>
              <SettingToggle
                checked={settings.showSidebar}
                onChange={(value) => update({ showSidebar: value })}
                label="Show device sidebar"
                description="The host list and workspace navigation."
              />
              <SettingToggle
                checked={settings.showTroubleshootPanel}
                onChange={(value) => update({ showTroubleshootPanel: value })}
                label="Show troubleshooting panel"
                description="Searchable runbooks for the active device."
              />
              <SettingToggle
                checked={settings.reduceMotion}
                onChange={(value) => update({ reduceMotion: value })}
                label="Reduce motion"
                description="Disable modal and panel animations."
              />
              <FontField label="Application font" value={settings.uiFontFamily} onChange={(value) => update({ uiFontFamily: value })} />
            </div>
          ) : null}

          {activeTab === 'terminal' ? (
            <div className="settings-section">
              <div className="settings-heading">
                <h3>Terminal appearance</h3>
                <p>Every font, colour, and cursor setting applies to open sessions immediately.</p>
              </div>
              <TerminalPreview />
              <div className="setting-block">
                <label className="setting-label">Colour theme</label>
                <div className="theme-grid">
                  {TERMINAL_THEMES.map((preset) => (
                    <ThemeTile
                      key={preset.id}
                      theme={preset}
                      active={settings.terminalThemeId === preset.id}
                      onClick={() => update({ terminalThemeId: preset.id })}
                    />
                  ))}
                  <ThemeTile
                    theme={settings.customTerminalTheme ?? { ...theme, id: 'custom', name: 'Custom' }}
                    active={settings.terminalThemeId === 'custom'}
                    onClick={() => update({ terminalThemeId: 'custom' })}
                  />
                </div>
              </div>
              <div className="color-row">
                <label>
                  <span>Background</span>
                  <input type="color" value={theme.background} onChange={(event) => setCustomColor('background', event.target.value)} />
                </label>
                <label>
                  <span>Foreground</span>
                  <input type="color" value={theme.foreground} onChange={(event) => setCustomColor('foreground', event.target.value)} />
                </label>
                <label>
                  <span>Cursor</span>
                  <input type="color" value={theme.cursor} onChange={(event) => setCustomColor('cursor', event.target.value)} />
                </label>
                <label>
                  <span>Selection</span>
                  <input type="color" value={theme.selectionBackground} onChange={(event) => setCustomColor('selectionBackground', event.target.value)} />
                </label>
              </div>
              <FontField label="Terminal font" value={settings.fontFamily} onChange={(value) => update({ fontFamily: value })} />
              <Slider label="Font size" value={settings.fontSize} min={9} max={28} step={1} suffix="px" onChange={(value) => update({ fontSize: value })} />
              <Slider label="Line height" value={settings.lineHeight} min={0.9} max={1.8} step={0.02} onChange={(value) => update({ lineHeight: value })} />
              <Slider label="Letter spacing" value={settings.letterSpacing} min={-1} max={2} step={0.25} suffix="px" onChange={(value) => update({ letterSpacing: value })} />
              <div className="segmented-row">
                <div className="setting-copy">
                  <strong>Font weight</strong>
                </div>
                <select value={settings.fontWeight} onChange={(event) => update({ fontWeight: event.target.value })}>
                  <option value="300">Light</option>
                  <option value="400">Regular</option>
                  <option value="500">Medium</option>
                  <option value="600">Semibold</option>
                </select>
              </div>
              <div className="segmented-row">
                <div className="setting-copy">
                  <strong>Cursor</strong>
                </div>
                <div className="segmented">
                  {(['bar', 'block', 'underline'] as const).map((style) => (
                    <button
                      key={style}
                      className={settings.cursorStyle === style ? 'active' : ''}
                      onClick={() => update({ cursorStyle: style })}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
              <SettingToggle checked={settings.cursorBlink} onChange={(value) => update({ cursorBlink: value })} label="Blinking cursor" />
              <div className="setting-row">
                <div className="setting-copy">
                  <strong>Scrollback</strong>
                  <span>Lines kept in memory per terminal.</span>
                </div>
                <select value={settings.scrollback} onChange={(event) => update({ scrollback: Number(event.target.value) })}>
                  <option value={2000}>2,000</option>
                  <option value={5000}>5,000</option>
                  <option value={10000}>10,000</option>
                  <option value={25000}>25,000</option>
                  <option value={50000}>50,000</option>
                </select>
              </div>
              <SettingToggle checked={settings.copyOnSelect} onChange={(value) => update({ copyOnSelect: value })} label="Copy on select" description="Copy terminal selections to the clipboard automatically." />
              <SettingToggle checked={settings.rightClickPaste} onChange={(value) => update({ rightClickPaste: value })} label="Right-click to copy or paste" />
              <SettingToggle checked={settings.clickableLinks} onChange={(value) => update({ clickableLinks: value })} label="Clickable links" description="Open http(s) links found in terminal output." />
            </div>
          ) : null}

          {activeTab === 'suggestions' ? (
            <div className="settings-section">
              <div className="settings-heading">
                <h3>Inline suggestions</h3>
                <p>
                  TSTerm predicts the next word from the active device pack, saved snippets, and your recent commands.
                  Suggestions appear dim after the cursor and never replace what you type.
                </p>
              </div>
              <SettingToggle
                checked={settings.inlineSuggestions}
                onChange={(value) => update({ inlineSuggestions: value })}
                label="Enable next-word predictions"
                description="Context-aware suggestions in the terminal, including network CLI commands."
              />
              <div className="suggestion-demo" style={{ background: theme.background, color: theme.foreground, fontFamily: settings.fontFamily }}>
                <span style={{ color: theme.green }}>ciscoasa/act#</span> show ip bgp
                <span style={{ color: ghostColor(theme, settings.ghostOpacity) }}> summary</span>
                <div className="suggestion-demo-hint">
                  <kbd>Tab</kbd> accept
                  <span>·</span>
                  <kbd>Esc</kbd> dismiss
                </div>
              </div>
              <Slider
                label="Ghost text opacity"
                value={Math.round(settings.ghostOpacity * 100)}
                min={10}
                max={70}
                step={2}
                suffix="%"
                description="Lower is more subtle. The ghost is always dimmer than the text you typed."
                onChange={(value) => update({ ghostOpacity: value / 100 })}
              />
              <div className="segmented-row">
                <div className="setting-copy">
                  <strong>Accept with</strong>
                  <span>Tab is recommended because it is unused by most network CLIs.</span>
                </div>
                <div className="segmented">
                  {(['tab', 'right'] as const).map((key) => (
                    <button key={key} className={settings.suggestionAcceptKey === key ? 'active' : ''} onClick={() => update({ suggestionAcceptKey: key })}>
                      {key === 'tab' ? 'Tab' : '→ key'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-note-card">
                <Sparkles size={15} />
                <div>
                  <strong>Where predictions come from</strong>
                  <p>
                    Command templates in the active device pack, your saved snippets, and command history for this
                    session. Password prompts and full-screen programs are excluded.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'sessions' ? (
            <div className="settings-section">
              <div className="settings-heading">
                <h3>Sessions and trust</h3>
                <p>Connection safety and local session behaviour.</p>
              </div>
              <SettingToggle
                checked={settings.strictHostKeyChecking}
                onChange={(value) => update({ strictHostKeyChecking: value })}
                label="Strict host key checking"
                description="Ask before trusting a new fingerprint and warn if a known key changes. Recommended."
              />
              <div className="setting-row">
                <div className="setting-copy">
                  <strong>SSH keepalive</strong>
                  <span>Seconds between keepalive probes. 0 disables them.</span>
                </div>
                <input
                  className="small-number"
                  type="number"
                  min={0}
                  max={300}
                  value={settings.keepaliveSeconds}
                  onChange={(event) => update({ keepaliveSeconds: Number(event.target.value) })}
                />
              </div>
              <SettingToggle
                checked={settings.logSessions}
                onChange={(value) => update({ logSessions: value })}
                label="Write session transcripts"
                description="Append terminal output to local text files. Commands and output may contain sensitive data."
              />
              {settings.logSessions ? (
                <button className="btn btn-sm" onClick={() => void window.tsterm.app.revealPath(bootstrap?.paths.logs ?? '')}>
                  <FolderOpen size={14} /> Open logs folder
                </button>
              ) : null}
              <div className="setting-block">
                <label className="setting-label">Local shell</label>
                <input
                  value={settings.localShell}
                  onChange={(event) => update({ localShell: event.target.value })}
                  placeholder="Auto: PowerShell on Windows, $SHELL on macOS/Linux"
                  spellCheck={false}
                />
                <span className="setting-description">
                  Used when you choose Local terminal. Leave blank to auto-detect.
                </span>
              </div>
              <SettingToggle
                checked={settings.sftpShowHidden}
                onChange={(value) => update({ sftpShowHidden: value })}
                label="Show hidden SFTP files"
                description="Include dotfiles in the SFTP browser."
              />
              <div className="settings-note-card">
                <ShieldCheck size={15} />
                <div>
                  <strong>Credentials stay local</strong>
                  <p>Passwords are encrypted using Electron safeStorage. Jump hosts reuse their saved credentials.</p>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'ai' ? (
            <div className="settings-section">
              <div className="settings-heading">
                <h3>AI troubleshooting assistant</h3>
                <p>
                  An optional thinking partner. It can read the device type and, if you allow it, recent
                  terminal output — but it has no ability to run commands.
                </p>
              </div>

              <div className={cx('ai-settings-hero', settings.aiEnabled && 'on')}>
                <span className="ai-settings-hero-icon">
                  <Bot size={20} />
                </span>
                <div className="ai-settings-hero-copy">
                  <strong>{settings.aiEnabled ? 'AI assistant is on' : 'AI assistant is off'}</strong>
                  <span>
                    {settings.aiEnabled
                      ? 'The Assistant tab is available. It can suggest and fill commands; you press Enter.'
                      : 'Nothing is sent anywhere until you turn this on and choose a provider.'}
                  </span>
                </div>
                <button
                  className={cx('switch', settings.aiEnabled && 'on')}
                  role="switch"
                  aria-checked={settings.aiEnabled}
                  aria-label="Enable AI assistant"
                  onClick={() => update({ aiEnabled: !settings.aiEnabled })}
                >
                  <span />
                </button>
              </div>

              {settings.aiEnabled ? (
                <>
                  <SettingToggle
                    checked={settings.aiIncludeContext}
                    onChange={(value) => update({ aiIncludeContext: value })}
                    label="Include device and terminal context"
                    description="Adds the device pack, matching runbooks, the current command line, and the last 80 terminal lines. Passwords and common secret fields are redacted."
                  />

                  <div className="settings-note-card ai-guardrail-card">
                    <ShieldCheck size={15} />
                    <div>
                      <strong>The assistant cannot execute anything</strong>
                      <p>
                        It has no terminal, SSH, or file access. Suggested commands appear in the chat;
                        filling the prompt writes one line without pressing Enter, and only when you click.
                        Every execution stays yours.
                      </p>
                    </div>
                  </div>

                  <div className="settings-subhead">
                    <h4>Provider</h4>
                    <span>{settings.aiProfiles.length} configured</span>
                  </div>
                  <div className="ai-provider-picker">
                    <select
                      value={activeProfile?.id ?? ''}
                      onChange={(event) => {
                        if (profileIsDirty && !window.confirm('Discard unsaved provider changes?')) return
                        update({ aiActiveProfileId: event.target.value })
                      }}
                      aria-label="Active AI provider"
                    >
                      {settings.aiProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name}
                          {profile.local && !/local/i.test(profile.name) ? ' (local)' : ''}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-sm" onClick={addProfile}>
                      <Plus size={13} /> Add provider
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={removeProfile}
                      disabled={settings.aiProfiles.length <= 1}
                      title="Remove this provider"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {profileDraft ? (
                    <div className="ai-profile-editor">
                      <div className="ai-profile-grid">
                        <label>
                          <span>Name</span>
                          <input
                            value={profileDraft.name}
                            onChange={(event) => patchProfile({ name: event.target.value })}
                            spellCheck={false}
                          />
                        </label>
                        <label>
                          <span>API style</span>
                          <select
                            value={profileDraft.kind}
                            onChange={(event) =>
                              patchProfile({
                                kind: event.target.value === 'anthropic' ? 'anthropic' : 'openai-compatible'
                              })
                            }
                          >
                            <option value="openai-compatible">OpenAI compatible</option>
                            <option value="anthropic">Anthropic messages</option>
                          </select>
                        </label>
                        <label className="wide">
                          <span>Base URL</span>
                          <input
                            value={profileDraft.baseUrl}
                            onChange={(event) => patchProfile({ baseUrl: event.target.value })}
                            placeholder="http://127.0.0.1:11434/v1"
                            spellCheck={false}
                          />
                          <small>
                            Ollama: http://127.0.0.1:11434/v1 · LM Studio: http://127.0.0.1:1234/v1 ·
                            Cloud: your provider's API base.
                          </small>
                        </label>
                        <label>
                          <span>Auth header</span>
                          <select
                            value={profileDraft.authStyle}
                            onChange={(event) =>
                              patchProfile({
                                authStyle:
                                  event.target.value === 'x-api-key' ||
                                  event.target.value === 'api-key' ||
                                  event.target.value === 'none'
                                    ? event.target.value
                                    : 'bearer'
                              })
                            }
                          >
                            <option value="bearer">Authorization: Bearer</option>
                            <option value="x-api-key">x-api-key</option>
                            <option value="api-key">api-key</option>
                            <option value="none">No authentication</option>
                          </select>
                        </label>
                        <label>
                          <span>Max tokens</span>
                          <input
                            type="number"
                            min={64}
                            max={8192}
                            value={profileDraft.maxTokens}
                            onChange={(event) => patchProfile({ maxTokens: Number(event.target.value) })}
                          />
                        </label>
                      </div>

                      <div className="ai-model-row">
                        <label>
                          <span>Model</span>
                          <input
                            value={profileDraft.model}
                            onChange={(event) => patchProfile({ model: event.target.value })}
                            placeholder="llama3.2"
                            spellCheck={false}
                          />
                        </label>
                        <button className="btn btn-sm" onClick={() => void fetchModels()} disabled={modelBusy}>
                          {modelBusy ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
                          {modelBusy ? 'Asking…' : 'Fetch models'}
                        </button>
                        {models.length ? (
                          <select
                            value={models.includes(profileDraft.model) ? profileDraft.model : ''}
                            onChange={(event) => patchProfile({ model: event.target.value })}
                            aria-label="Detected models"
                          >
                            <option value="">{models.length} detected…</option>
                            {models.map((model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                      {modelError ? <div className="ai-inline-error">{modelError}</div> : null}

                      <Slider
                        label="Temperature"
                        value={profileDraft.temperature}
                        min={0}
                        max={2}
                        step={0.1}
                        description="Lower is more deterministic. 0.1–0.3 works best for device troubleshooting."
                        onChange={(value) => patchProfile({ temperature: value })}
                      />

                      {profileDraft.authStyle !== 'none' ? (
                        <div className="ai-key-block">
                          <div className="ai-key-head">
                            <span>
                              <KeyRound size={13} /> API key
                              {activeProfile && aiKeyIds.includes(activeProfile.id) ? (
                                <em className="ai-key-saved">
                                  <Check size={11} /> saved
                                </em>
                              ) : (
                                <em className="ai-key-missing">not set</em>
                              )}
                            </span>
                            {activeProfile && aiKeyIds.includes(activeProfile.id) ? (
                              <button className="btn btn-ghost btn-xs" onClick={() => void removeKey()}>
                                <Trash2 size={11} /> Remove key
                              </button>
                            ) : null}
                          </div>
                          <div className="ai-key-row">
                            <input
                              type={keyVisible ? 'text' : 'password'}
                              value={keyDraft}
                              onChange={(event) => setKeyDraft(event.target.value)}
                              placeholder={
                                activeProfile && aiKeyIds.includes(activeProfile.id)
                                  ? 'Replace saved key…'
                                  : 'Paste the API key'
                              }
                              spellCheck={false}
                              autoComplete="off"
                            />
                            <button
                              className="icon-btn tiny"
                              onClick={() => setKeyVisible((visible) => !visible)}
                              title={keyVisible ? 'Hide key' : 'Show key'}
                            >
                              {keyVisible ? <X size={13} /> : <KeyRound size={13} />}
                            </button>
                            <button className="btn btn-sm" onClick={() => void saveKey()} disabled={!keyDraft.trim()}>
                              Save key
                            </button>
                          </div>
                          <span className="setting-description">
                            Encrypted with Electron safeStorage (the OS keychain). TSTerm never displays a saved
                            key again. If the keychain is unavailable it is kept in memory for this run only.
                          </span>
                        </div>
                      ) : null}

                      <div className="ai-profile-actions">
                        <button className="btn btn-sm btn-primary" onClick={saveProfile} disabled={!profileIsDirty}>
                          <Check size={13} /> Save provider
                        </button>
                        {profileIsDirty ? <span className="ai-unsaved">Unsaved changes</span> : null}
                        <span className={cx('ai-local-badge', profileDraft.local && 'local')}>
                          {profileDraft.local ? 'Local endpoint' : 'Remote endpoint'}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  <div className="settings-note-card">
                    <Database size={15} />
                    <div>
                      <strong>What leaves this computer</strong>
                      <p>
                        Only the chat messages you send and the context you enable, sent directly to the
                        provider you configured. Nothing goes to TSTerm or any analytics service. Local
                        endpoints keep everything on this machine.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="ai-off-note">
                  <Bot size={18} />
                  <p>
                    Enable the assistant above to configure Ollama, LM Studio, or your own API provider.
                    TSTerm stays fully usable without it.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {activeTab === 'data' ? (
            <div className="settings-section">
              <div className="settings-heading">
                <h3>Data and device packs</h3>
                <p>Everything lives on this computer. You can inspect, back up, or extend every part.</p>
              </div>
              <div className="path-list">
                {[
                  { label: 'Application data', path: bootstrap?.paths.appData, icon: Database },
                  { label: 'Custom device packs', path: bootstrap?.paths.customCatalog, icon: FolderOpen },
                  { label: 'Session logs', path: bootstrap?.paths.logs, icon: Activity },
                  { label: 'Exports', path: bootstrap?.paths.exports, icon: Download }
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <button key={item.label} className="path-row" onClick={() => void window.tsterm.app.revealPath(item.path ?? '')}>
                      <Icon size={14} />
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.path}</small>
                      </span>
                      <ExternalLink size={13} />
                    </button>
                  )
                })}
              </div>
              <div className="settings-subhead">
                <h4>Troubleshooting catalog</h4>
                <span>{catalog.types.length} device packs</span>
              </div>
              <div className="button-row">
                <button className="btn btn-sm" onClick={() => void reloadCatalog()} disabled={reloadBusy}>
                  <RefreshCw size={14} className={reloadBusy ? 'spin' : undefined} /> Reload catalog
                </button>
                <button className="btn btn-sm" onClick={() => void importPack()} disabled={reloadBusy}>
                  <Upload size={14} /> Import pack
                </button>
                <button className="btn btn-sm" onClick={() => void window.tsterm.catalog.openFolder()}>
                  <FolderOpen size={14} /> Open packs folder
                </button>
                <button className="btn btn-sm" onClick={() => setModal({ kind: 'new-device-type' })}>
                  <Sparkles size={14} /> New device type
                </button>
              </div>
              {catalog.issues.length ? (
                <div className="catalog-issues">
                  <div className="catalog-issues-head">
                    <ShieldCheck size={14} /> Catalog issues ({catalog.issues.length})
                  </div>
                  {catalog.issues.slice(0, 8).map((issue, index) => (
                    <div className={`catalog-issue ${issue.severity}`} key={`${issue.message}-${index}`}>
                      <span>{issue.severity}</span>
                      <p>
                        {issue.message}
                        {issue.source ? <small>{issue.source}</small> : null}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="catalog-ok">
                  <Check size={14} /> All device packs loaded without errors.
                </div>
              )}
              <div className="settings-subhead">
                <h4>Hosts and trust</h4>
              </div>
              <div className="button-row">
                <button className="btn btn-sm" onClick={() => void importHosts()}>
                  <Download size={14} /> Import hosts
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    void window.tsterm.hosts.exportHosts().then((result) => {
                      if (result) notify({ kind: 'success', title: 'Hosts exported', message: result.path })
                    })
                  }}
                >
                  <Upload size={14} /> Export hosts
                </button>
                <button className="btn btn-sm" onClick={() => setModal({ kind: 'known-hosts' })}>
                  <ShieldCheck size={14} /> Known hosts ({knownHosts.length})
                </button>
                <button className="btn btn-sm" onClick={() => setModal({ kind: 'debug' })}>
                  <Activity size={14} /> Debug records ({debugSessions.length})
                </button>
              </div>
            </div>
          ) : null}

          {activeTab === 'about' ? (
            <div className="settings-section about-section">
              <div className="about-hero">
                <div className="about-mark">
                  <Terminal size={28} />
                </div>
                <div>
                  <h3>TSTerm</h3>
                  <p>A troubleshooting console built for the device in front of you.</p>
                  <span className="about-version">Version {bootstrap?.appVersion ?? '0.1.0'}</span>
                </div>
              </div>
              <div className="about-copy">
                <p>
                  TSTerm remembers the platform per host, turns protocol knowledge into safe runbooks, and makes
                  sure debugs and captures are cleaned up before you leave.
                </p>
              </div>
              <div className="settings-subhead">
                <h4>Updates</h4>
              </div>
              <SettingToggle
                checked={settings.autoCheckUpdates}
                onChange={(value) => update({ autoCheckUpdates: value })}
                label="Check once a day"
                description="On launch, quietly ask GitHub for a newer release and offer a download."
              />
              <div className="button-row">
                <button className="btn btn-sm btn-primary" onClick={() => void checkUpdates()} disabled={checking}>
                  <RefreshCw size={14} className={checking ? 'spin' : undefined} /> {checking ? 'Checking…' : 'Check for updates'}
                </button>
                {settings.skippedUpdateVersion ? (
                  <button className="btn btn-sm" onClick={() => update({ skippedUpdateVersion: undefined })}>
                    <BellOff size={14} /> Unskip v{settings.skippedUpdateVersion}
                  </button>
                ) : null}
              </div>
              {updateMessage ? (
                <div className={`settings-inline-status${updateError ? ' error' : ''}`}>
                  {updateError ? <ShieldCheck size={14} /> : <Check size={14} />}
                  <span>{updateMessage}</span>
                </div>
              ) : null}
              <p className="about-fineprint">
                Update checks only read the latest public release from GitHub. Downloads are always manual.
              </p>
              <div className="settings-subhead">
                <h4>Support the project</h4>
              </div>
              <button
                className="coffee-card"
                onClick={() => void window.tsterm.app.openExternal('https://buymeacoffee.com/issac_john')}
              >
                <span className="coffee-icon">
                  <Coffee size={20} />
                </span>
                <span>
                  <strong>Buy me a coffee</strong>
                  <small>If TSTerm saves you time, you can support the next release.</small>
                </span>
                <ExternalLink size={15} />
              </button>
              <div className="settings-subhead">
                <h4>Shortcuts</h4>
              </div>
              <button className="btn btn-sm" onClick={() => setModal({ kind: 'help' })}>
                <Keyboard size={14} /> View all keyboard shortcuts
              </button>
              <div className="about-credits">
                <span>Built with Electron, React, xterm.js, and ssh2.</span>
                <span>Device knowledge lives in editable JSON packs.</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
