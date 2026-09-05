/** One hidden file input serves every "Import" affordance in the app. The top bar
 * mounts it; anything else asks for it to open. */
let input: HTMLInputElement | null = null

export const registerImportInput = (el: HTMLInputElement | null): void => {
  input = el
}

export const openImportPicker = (): void => {
  input?.click()
}
