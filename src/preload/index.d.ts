import type { TstermApi } from '@shared/types'

declare global {
  interface Window {
    tsterm: TstermApi
  }
}

export {}
