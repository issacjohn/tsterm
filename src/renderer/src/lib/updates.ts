import { useAppStore } from '../store'

export async function checkForUpdates(manual = true): Promise<void> {
  const state = useAppStore.getState()
  try {
    const result = await window.tsterm.updates.check(true)
    if (result.available && result.update) {
      useAppStore.getState().setModal({ kind: 'update', info: result.update, manual })
      return
    }
    useAppStore.getState().notify({
      kind: 'info',
      title: result.checked ? 'TSTerm is up to date' : 'Update check',
      message:
        result.reason ||
        `You are on the latest version (${state.bootstrap?.appVersion ?? '0.0.0'}).`
    })
  } catch (error) {
    useAppStore.getState().notify({
      kind: 'error',
      title: 'Update check failed',
      message: (error as Error).message
    })
  }
}
