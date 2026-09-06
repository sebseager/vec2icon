/** The user's Anthropic key lives in this browser's IndexedDB and nowhere else. */
import { del, get, set } from 'idb-keyval'

export const API_KEY_STORAGE_KEY = 'vec2icon:anthropic-api-key'

export type KeyStore = {
  load(): Promise<string | null>
  save(key: string): Promise<void>
  forget(): Promise<void>
}

export const idbKeyStore: KeyStore = {
  load: async () => {
    const value = await get(API_KEY_STORAGE_KEY)
    return typeof value === 'string' && value ? value : null
  },
  save: (key) => set(API_KEY_STORAGE_KEY, key),
  forget: () => del(API_KEY_STORAGE_KEY),
}
