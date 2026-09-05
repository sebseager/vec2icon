/** Reads dropped or chosen files and pushes what they contain into the document. */
import { type ImportFile, importSvgFiles } from '@/core/svg'
import type { EditorState } from '@/state'

const read = async (file: File): Promise<ImportFile> => ({
  name: file.name,
  data: new Uint8Array(await file.arrayBuffer()),
})

const messageOf = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : 'the file could not be read'

/** Imports every file, adding one group per source and one toast per refusal.
 * A file the browser cannot even read — moved, offline, permission revoked —
 * is reported the same way rather than failing the whole drop. */
export const importFiles = async (files: File[], state: EditorState): Promise<void> => {
  if (files.length === 0) return

  const opened = await Promise.all(
    files.map(async (file) => {
      try {
        return { ok: true as const, value: await read(file) }
      } catch (error) {
        return { ok: false as const, name: file.name, reason: messageOf(error) }
      }
    }),
  )

  const readable: ImportFile[] = []
  for (const entry of opened) {
    if (entry.ok) readable.push(entry.value)
    else state.pushToast({ message: `Could not read ${entry.name}: ${entry.reason}` })
  }
  if (readable.length === 0) return

  const result = await importSvgFiles(readable)
  if (result.groups.length > 0) state.importGroups(result.groups)
  for (const { file, reason } of result.rejected) {
    state.pushToast({ message: `Rejected ${file}: ${reason}` })
  }
}
