/** File type filters for the save panel, as `showSaveFilePicker` expects. */
export type SaveType = { description: string; accept: Record<string, string[]> }

/**
 * What actually happened to the blob:
 * - `saved`: written through the File System Access save panel.
 * - `cancelled`: the user dismissed that panel (or it never yielded a handle) —
 *   nothing reached the disk, and the caller must not claim otherwise.
 * - `fallback`: handed to the browser as an anchor click. The browser owns it
 *   from there, so this is as close to "saved" as we can honestly get.
 */
export type DownloadResult = 'saved' | 'cancelled' | 'fallback'

type SaveFilePicker = (options: { suggestedName: string; types?: SaveType[] }) => Promise<{
  createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }>
}>

const savePicker = (): SaveFilePicker | null => {
  const picker = (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker
  return typeof picker === 'function' ? (picker as SaveFilePicker) : null
}

const isAbort = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'

const anchorDownload = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Revoking in the same task as the synthetic click races the download the click
  // started; several engines then abort it or save an empty file. Let the task finish.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Save a blob to disk: the File System Access save panel where it exists —
 * cancelling it is not an error, just `'cancelled'` — otherwise a blob-url anchor click. */
export const downloadBlob = async (
  blob: Blob,
  fileName: string,
  opts?: { types?: SaveType[] },
): Promise<DownloadResult> => {
  const picker = savePicker()
  if (picker) {
    try {
      const handle = await picker({ suggestedName: fileName, types: opts?.types })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return 'saved'
    } catch (err) {
      if (isAbort(err)) return 'cancelled'
      // Anything else (unsupported filter, permission failure) falls back below.
    }
  }
  anchorDownload(blob, fileName)
  return 'fallback'
}
