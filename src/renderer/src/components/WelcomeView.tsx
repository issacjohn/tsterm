import {
  ArrowRight,
  Camera,
  ChevronRight,
  Command,
  Laptop,
  Plus,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal
} from 'lucide-react'
import { useAppStore } from '../store'
import { connectHost, openHostEditor, openLocalTerminal } from '../lib/session-actions'
import { timeAgo, truncate } from '../lib/format'

export function WelcomeView(): React.JSX.Element {
  const hosts = useAppStore((state) => state.hosts)
  const catalog = useAppStore((state) => state.catalog)
  const snippets = useAppStore((state) => state.snippets)
  const platform = useAppStore((state) => state.appPlatform)
  const setModal = useAppStore((state) => state.setModal)

  const recent = [...hosts]
    .sort((a, b) => (b.lastConnectedAt ?? '').localeCompare(a.lastConnectedAt ?? ''))
    .slice(0, 3)
  const workflowCount = catalog.types.reduce((count, type) => count + type.workflows.length, 0)
  const families = [...new Set(catalog.types.map((type) => type.family))].slice(0, 4)
  const mod = platform === 'darwin' ? '⌘' : 'Ctrl'

  return (
    <div className="welcome">
      <div className="welcome-grid">
        <div className="welcome-copy">
          <span className="eyebrow">
            <span className="eyebrow-dot" /> Network operations workspace
          </span>
          <h1>
            Know the device.
            <br />
            <span>Know the commands.</span>
          </h1>
          <p>
            Connect over SSH, choose the device type once, and TSTerm remembers it. Search a protocol,
            fill in the filter, and get a safe, complete runbook — with cleanup included.
          </p>

          <div className="welcome-actions">
            <button className="btn btn-primary btn-lg" onClick={() => openHostEditor()}>
              <Plus size={17} />
              New SSH connection
              <kbd>{mod} N</kbd>
            </button>
            <button className="btn btn-lg" onClick={() => openLocalTerminal()}>
              <Laptop size={16} />
              Local terminal
            </button>
          </div>

          <div className="welcome-stats">
            <div>
              <strong>{catalog.types.length}</strong>
              <span>device packs</span>
            </div>
            <div>
              <strong>{workflowCount}</strong>
              <span>runbooks</span>
            </div>
            <div>
              <strong>{snippets.length}</strong>
              <span>snippets</span>
            </div>
            <div className="family-stat">
              <strong>{families.length ? `${families[0]} +${Math.max(0, families.length - 1)}` : 'Any'}</strong>
              <span>platforms</span>
            </div>
          </div>

          {recent.length ? (
            <div className="recent-block">
              <div className="section-line">
                <span>Continue where you left off</span>
                <button className="text-link" onClick={() => setModal({ kind: 'palette' })}>
                  View all <ChevronRight size={13} />
                </button>
              </div>
              <div className="recent-grid">
                {recent.map((host) => {
                  const type = catalog.types.find((item) => item.id === host.deviceType)
                  return (
                    <button className="recent-host" key={host.id} onClick={() => connectHost(host.id)}>
                      <span className="recent-avatar">{host.label.slice(0, 2).toUpperCase()}</span>
                      <span className="recent-copy">
                        <strong>{truncate(host.label, 22)}</strong>
                        <small>
                          {type?.name ?? 'Device type not set'} · {timeAgo(host.lastConnectedAt)}
                        </small>
                      </span>
                      <ArrowRight size={14} />
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="welcome-visual">
          <div className="welcome-glow" />
          <div className="welcome-terminal-card">
            <div className="mock-term-head">
              <span className="traffic-lights">
                <i />
                <i />
                <i />
              </span>
              <span className="mock-term-title">ASA-HQ · Cisco ASA</span>
              <span className="mock-term-secure">
                <ShieldCheck size={12} /> SSH
              </span>
            </div>
            <div className="mock-term-body">
              <div className="mock-prompt-line">
                <span className="mock-prompt">ciscoasa/act#</span> <span>debug rad</span>
                <span className="mock-ghost">ius all</span>
              </div>
              <div className="mock-output">
                <span className="mock-accent">debug radius all</span>
              </div>
              <div className="mock-cursor-line">
                <span className="mock-prompt">ciscoasa/act#</span>
                <span className="mock-cursor" />
              </div>
              <div className="mock-suggestion-chip">
                <Sparkles size={11} />
                catalog suggestion
                <kbd>Tab</kbd>
              </div>
            </div>
            <div className="mock-term-foot">
              <span className="mock-foot-dot connected" />
              Device type remembered
              <span className="mock-foot-sep" />
              Debug guard armed
            </div>
          </div>

          <div className="float-card float-top">
            <div className="float-icon">
              <Server size={15} />
            </div>
            <div>
              <strong>Pick once</strong>
              <span>Device type saved per host</span>
            </div>
          </div>
          <div className="float-card float-bottom">
            <div className="float-icon amber">
              <Camera size={15} />
            </div>
            <div>
              <strong>Capture with cleanup</strong>
              <span>Every runbook ends with a stop command</span>
            </div>
          </div>
        </div>
      </div>

      <div className="welcome-feature-grid">
        <div className="feature-card">
          <div className="feature-icon">
            <Command size={17} />
          </div>
          <h3>Predict while you type</h3>
          <p>Dim inline suggestions complete the next word from the command catalog. Press Tab to accept.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">
            <ShieldCheck size={17} />
          </div>
          <h3>Never leave a debug on</h3>
          <p>TSTerm tracks debugs and captures, then offers the exact cleanup commands when you quit.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">
            <Terminal size={17} />
          </div>
          <h3>One console, every platform</h3>
          <p>ASA, FTD, FMC, IOS-XE, NX-OS, wireless, Palo Alto, Meraki, Windows, Linux, and macOS.</p>
        </div>
        <button className="feature-card feature-action" onClick={() => setModal({ kind: 'snippets' })}>
          <div className="feature-icon">
            <Sparkles size={17} />
          </div>
          <h3>Build your own library</h3>
          <p>Save snippets, import device packs, or create a new platform without waiting for an update.</p>
          <span className="feature-link">
            Open snippets <ArrowRight size={13} />
          </span>
        </button>
      </div>
    </div>
  )
}
