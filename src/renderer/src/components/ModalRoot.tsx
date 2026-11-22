import { useAppStore } from '../store'
import { HostModal } from './modals/HostModal'
import { DeviceTypeModal } from './modals/DeviceTypeModal'
import { PasswordModal } from './modals/PasswordModal'
import { HostKeyModal } from './modals/HostKeyModal'
import { SettingsModal } from './modals/SettingsModal'
import { SftpModal } from './modals/SftpModal'
import { ForwardsModal } from './modals/ForwardsModal'
import { SnippetsModal } from './modals/SnippetsModal'
import { DebugModal } from './modals/DebugModal'
import { QuitModal } from './modals/QuitModal'
import { HelpModal } from './modals/HelpModal'
import { NewDeviceTypeModal } from './modals/NewDeviceTypeModal'
import { KnownHostsModal } from './modals/KnownHostsModal'
import { CommandPalette } from './modals/CommandPalette'
import { UpdateModal } from './modals/UpdateModal'
import { RunbookModal } from './RunbookModal'

export function ModalRoot(): React.JSX.Element | null {
  const modal = useAppStore((state) => state.modal)
  const setModal = useAppStore((state) => state.setModal)
  if (!modal) return null

  switch (modal.kind) {
    case 'host':
      return <HostModal hostId={modal.hostId} onClose={() => setModal(null)} />
    case 'device-type':
      return <DeviceTypeModal modal={modal} />
    case 'password':
      return <PasswordModal pending={modal.pending} error={modal.error} />
    case 'hostkey':
      return <HostKeyModal pending={modal.pending} error={modal.error} />
    case 'settings':
      return <SettingsModal tab={modal.tab} onClose={() => setModal(null)} />
    case 'sftp':
      return <SftpModal sessionId={modal.sessionId} title={modal.title} />
    case 'forwards':
      return <ForwardsModal sessionId={modal.sessionId} title={modal.title} />
    case 'snippets':
      return <SnippetsModal />
    case 'debug':
      return <DebugModal />
    case 'quit':
      return <QuitModal sessions={modal.sessions} />
    case 'help':
      return <HelpModal />
    case 'new-device-type':
      return <NewDeviceTypeModal />
    case 'known-hosts':
      return <KnownHostsModal />
    case 'palette':
      return <CommandPalette />
    case 'update':
      return <UpdateModal info={modal.info} manual={modal.manual} />
    case 'runbook':
      return <RunbookModal />
    default:
      return null
  }
}
