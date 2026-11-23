import {
  Coffee,
  Command,
  Keyboard,
  LifeBuoy,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Wrench
} from 'lucide-react'
import { useAppStore } from '../../store'
import { modifierLabel } from '../../lib/format'
import { Modal } from '../ui/Modal'

export function HelpModal(): React.JSX.Element {
  const setModal = useAppStore((state) => state.setModal)
  const platform = useAppStore((state) => state.appPlatform)
  const mod = modifierLabel(platform)
  const shortcuts: Array<[string, string, string]> = [
    ['New SSH connection', `${mod} Shift N`, 'Open the host editor'],
    ['Local terminal', `${mod} Shift T`, 'PowerShell, zsh, or bash'],
    ['Command palette', `${mod} Shift P`, 'Jump to any action or host'],
    ['Settings', `${mod} ,`, 'Appearance, fonts, sessions'],
    ['Close tab', `${mod} Shift W`, 'Closes the active tab'],
    ['Toggle troubleshooting', `${mod} Shift K`, 'Show or hide the runbook panel'],
    ['AI assistant', `${mod} Shift A`, 'Optional chat partner — never runs commands'],
    ['Debug guard', `${mod} Shift D`, 'Review and clean up debugs'],
    ['Quit TSTerm', `${mod} Q`, 'Asks before leaving debugs running'],
    ['Keyboard shortcuts', 'F1', 'This dialog'],
    ['Find in terminal', 'Ctrl F', 'Search the active scrollback'],
    ['Copy terminal selection', 'Ctrl Shift C', 'Also Ctrl+Insert'],
    ['Paste into terminal', 'Ctrl Shift V', 'Also Shift+Insert'],
    ['Accept suggestion', 'Tab', 'Accepts the dim next-word suggestion'],
    ['Dismiss suggestion', 'Esc', 'Hides the ghost text'],
    ['Font size', 'Ctrl + / − / 0', 'Zoom the terminal font'],
    ['Next / previous tab', 'Ctrl Tab / Ctrl Shift Tab', 'Cycle sessions'],
    ['SFTP browser', `${mod} Shift S`, 'Browse files over the SSH session']
  ]

  return (
    <Modal
      title="Help & shortcuts"
      description="A quick tour of the parts that matter when you are in the middle of an incident."
      icon={<LifeBuoy size={20} />}
      size="lg"
      onClose={() => setModal(null)}
      footer={
        <>
          <div className="modal-footer-left">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => void window.tsterm.app.openExternal('https://buymeacoffee.com/issac_john')}
            >
              <Coffee size={14} /> Buy me a coffee
            </button>
          </div>
          <div className="modal-footer-actions">
            <button className="btn" onClick={() => setModal(null)}>
              Close
            </button>
          </div>
        </>
      }
    >
      <div className="help-panel">
        <div className="help-hero">
          <div className="help-hero-icon">
            <TerminalSquare size={22} />
          </div>
          <div>
            <h3>Work the problem, not the tooling</h3>
            <p>
              TSTerm is a desktop SSH console with a protocol-aware runbook library. It never stores device
              passwords in plaintext, and it always tries to leave a device cleaner than it found it.
            </p>
          </div>
        </div>

        <div className="help-feature-row">
          <div>
            <Sparkles size={15} />
            <strong>Type ahead</strong>
            <span>Dim predictions come from the active device pack, snippets, and command history.</span>
          </div>
          <div>
            <ShieldCheck size={15} />
            <strong>Debug guard</strong>
            <span>Debug and capture sessions are tracked until you stop them or mark them stopped.</span>
          </div>
          <div>
            <Wrench size={15} />
            <strong>Runbooks, not guesses</strong>
            <span>Every workflow carries variables, verification, notes, and cleanup commands.</span>
          </div>
        </div>

        <div className="help-section-head">
          <Keyboard size={15} /> Keyboard shortcuts
          <span>Windows / Linux and macOS</span>
        </div>
        <div className="shortcut-table">
          {shortcuts.map(([label, keys, description]) => (
            <div className="shortcut-row" key={label}>
              <span>{label}</span>
              <kbd>{keys}</kbd>
              <small>{description}</small>
            </div>
          ))}
        </div>

        <div className="help-section-head">
          <Command size={15} /> How device types work
        </div>
        <p className="help-copy">
          The first time you connect to a host, TSTerm asks what kind of device it is. The choice is stored on the
          host. Change it from the chip in the session toolbar or from the device menu. The type controls the
          runbook category, inline suggestions, and cleanup commands.
        </p>
        <div className="help-section-head">
          <ShieldCheck size={15} /> Leaving safely
        </div>
        <p className="help-copy">
          If a debug or capture is still tracked when you quit, TSTerm asks first. Connected sessions receive the
          cleanup automatically; disconnected sessions get the cleanup copied to your clipboard and written to the
          exports folder. If you close a tab manually, the record stays in the debug guard until you mark it stopped.
        </p>
      </div>
    </Modal>
  )
}
