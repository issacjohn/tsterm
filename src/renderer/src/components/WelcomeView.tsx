import {
  ArrowRight,
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
  const families = [...new Set(catalog.types.map((type) => type.family))]
  const mod = platform === 'darwin' ? '⌘' : 'Ctrl'

  return (
    <div className="welcome">
      <div className="welcome-shell">
        <div className="welcome-hero">
          <div className="welcome-copy">
            <div className="welcome-kicker">
              <span className="kicker-mark" />
              Network operations workspace
              <span className="kicker-index">N° 01</span>
            </div>

            <h1>
              Know the device.
              <br />
              <span>Know the commands.</span>
            </h1>

            <p>
              Connect over SSH, set the platform once, and TSTerm keeps every runbook, command, and safety
              check scoped to that device. Built for the work between the alert and the fix.
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
                <strong>{families.length}</strong>
                <span>platform families</span>
              </div>
              <div>
                <strong>{hosts.length}</strong>
                <span>saved devices</span>
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

          <div className="welcome-visual" aria-hidden="true">
            <div className="signal-monitor">
              <div className="signal-head">
                <span className="signal-name">
                  <i /> Signal monitor
                </span>
                <span className="signal-meta">ASA-HQ · 10.0.0.1</span>
              </div>

              <div className="signal-scope">
                <span className="scope-y scope-y-top">+</span>
                <span className="scope-y scope-y-mid">0</span>
                <span className="scope-y scope-y-low">−</span>
                <svg viewBox="0 0 560 132" preserveAspectRatio="none" role="presentation">
                  <path
                    className="scope-trace-dim"
                    d="M0 88 L40 88 L48 86 L56 90 L72 88 L104 88 L112 86 L120 90 L156 88 L188 88 L196 86 L204 90 L236 88 L280 88 L288 86 L296 90 L330 88 L368 88 L376 86 L384 90 L420 88 L468 88 L476 86 L484 90 L520 88 L560 88"
                  />
                  <path
                    className="scope-trace"
                    d="M0 88 L150 88 L158 88 L166 58 L172 112 L178 74 L184 88 L206 88 L322 88 L330 88 L338 38 L344 118 L350 68 L356 88 L378 88 L492 88 L500 88 L508 52 L514 110 L520 72 L526 88 L560 88"
                  />
                </svg>
                <div className="scope-tags">
                  <span>RX <b>124.8</b> Mb/s</span>
                  <span>TX <b>38.2</b> Mb/s</span>
                  <span>ERR <b>0</b></span>
                </div>
              </div>

              <div className="monitor-term">
                <div className="monitor-term-head">
                  <span>ciscoasa / active</span>
                  <span>session 01</span>
                </div>
                <div className="monitor-term-body">
                  <div>
                    <span className="monitor-prompt">#</span> show interface outside
                  </div>
                  <div className="monitor-dim">outside is up, line protocol is up</div>
                  <div className="monitor-dim">
                    rate <span>124.8 Mb/s</span> · errors <span>0</span>
                  </div>
                  <div className="monitor-type">
                    <span className="monitor-prompt">#</span> debug rad<span className="monitor-caret" />
                  </div>
                </div>
                <div className="monitor-foot">
                  <span>
                    <ShieldCheck size={11} /> device type remembered
                  </span>
                  <span>cleanup included</span>
                </div>
              </div>

              <div className="signal-annotations">
                <span>01 / live session</span>
                <span>12 ms</span>
              </div>
            </div>
          </div>
        </div>

        <section className="welcome-index">
          <div className="welcome-index-head">
            <span>Capabilities</span>
            <span>04</span>
          </div>
          <div className="welcome-feature-grid">
            <div className="feature-card">
              <div className="feature-top">
                <span className="feature-index">01</span>
                <div className="feature-icon">
                  <Command size={16} />
                </div>
              </div>
              <h3>Predict while you type</h3>
              <p>
                Dim next-word completion from that device&apos;s own command catalog. Tab accepts; you stay
                in control.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-top">
                <span className="feature-index">02</span>
                <div className="feature-icon">
                  <ShieldCheck size={16} />
                </div>
              </div>
              <h3>Never leave a debug on</h3>
              <p>
                Debugs, captures, and state changes are tracked per session, with the exact cleanup command
                waiting when you quit.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-top">
                <span className="feature-index">03</span>
                <div className="feature-icon">
                  <Terminal size={16} />
                </div>
              </div>
              <h3>One console, every platform</h3>
              <p>
                ASA, FTD, FMC, IOS-XE, NX-OS, wireless, Palo Alto, Meraki, Windows, Linux, and macOS.
              </p>
            </div>
            <button className="feature-card feature-action" onClick={() => setModal({ kind: 'snippets' })}>
              <div className="feature-top">
                <span className="feature-index">04</span>
                <div className="feature-icon">
                  <Sparkles size={16} />
                </div>
              </div>
              <h3>Build your own library</h3>
              <p>
                Save {snippets.length ? `${snippets.length} snippet${snippets.length === 1 ? '' : 's'}` : 'snippets'},
                import packs, or define a new platform. The assistant stays scoped to the device in front of you.
              </p>
              <span className="feature-link">
                Open snippets <ArrowRight size={13} />
              </span>
            </button>
          </div>
        </section>

        <div className="welcome-footline">
          <span>
            <Server size={12} /> Local-first. Credentials stay in the OS keychain.
          </span>
          <span>TSTerm / network operations console</span>
        </div>
      </div>
    </div>
  )
}
