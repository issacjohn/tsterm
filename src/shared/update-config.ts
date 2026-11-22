/**
 * Set this to the public GitHub repository that publishes TSTerm releases.
 * The daily update check is silent when this is left unconfigured.
 */
export const UPDATE_REPO = 'issacjohn/tsterm'

export function updateChecksConfigured(): boolean {
  return Boolean(UPDATE_REPO && UPDATE_REPO.includes('/') && !UPDATE_REPO.startsWith('OWNER/'))
}
