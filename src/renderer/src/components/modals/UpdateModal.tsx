import { useState } from 'react'
import { ArrowUpRight, BellOff, Bug, CheckCircle2, Clock, Download, ShieldAlert } from 'lucide-react'
import type { UpdateInfo } from '@shared/types'
import { useAppStore } from '../../store'
import { saveSettings } from '../../lib/session-actions'
import { Modal } from '../ui/Modal'

export function UpdateModal({ info, manual }: { info: UpdateInfo; manual: boolean }): React.JSX.Element {
  const setModal = useAppStore((state) => state.setModal)
  const notify = useAppStore((state) => state.notify)
  const [busy, setBusy] = useState(false)

  const close = (): void => setModal(null)

  const download = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.tsterm.app.openExternal(info.url)
      notify({ kind: 'info', title: 'Release opened', message: 'Download the installer from the release page.' })
      close()
    } finally {
      setBusy(false)
    }
  }

  const skip = (): void => {
    saveSettings({ skippedUpdateVersion: info.latestVersion })
    notify({ kind: 'info', title: 'Version skipped', message: `TSTerm will not prompt for ${info.latestVersion} again.` })
    close()
  }

  const disable = (): void => {
    saveSettings({ autoCheckUpdates: false })
    notify({ kind: 'info', title: 'Automatic updates off', message: 'You can still check manually from Settings.' })
    close()
  }

  return (
    <Modal
      title="A new TSTerm is available"
      description={`You are on ${info.currentVersion}. Version ${info.latestVersion} is ready to download.`}
      icon={<Bug size={20} />}
      size="md"
      onClose={close}
      footer={
        <>
          <div className="modal-footer-left">
            <button className="btn btn-ghost btn-sm" onClick={disable}>
              <BellOff size={14} /> Don’t auto-check
            </button>
          </div>
          <div className="modal-footer-actions">
            <button className="btn" onClick={skip}>
              Skip this version
            </button>
            <button className="btn" onClick={close}>
              <Clock size={14} /> Later
            </button>
            <button className="btn btn-primary" onClick={() => void download()} disabled={busy}>
              <Download size={14} /> Download update
            </button>
          </div>
        </>
      }
    >
      <div className="update-panel">
        <div className="update-versions">
          <div>
            <span>Installed</span>
            <strong>{info.currentVersion}</strong>
          </div>
          <ArrowUpRight size={16} />
          <div className="new">
            <span>Available</span>
            <strong>{info.latestVersion}</strong>
          </div>
          {manual ? <span className="update-badge">manual check</span> : <span className="update-badge">daily check</span>}
        </div>
        <div className="update-notes-head">
          <CheckCircle2 size={14} />
          What’s new
        </div>
        <div className="update-notes">
          {info.notes ? info.notes : 'This release includes bug fixes and improvements.'}
        </div>
        <div className="update-footnote">
          <ShieldAlert size={13} />
          Downloads are manual. Nothing is installed or replaced without you.
        </div>
      </div>
    </Modal>
  )
}
