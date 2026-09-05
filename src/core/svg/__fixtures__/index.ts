/// <reference types="node" />
/** Test-only helper: read a fixture SVG next to this file. Never imported by app code. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, name), 'utf8')
