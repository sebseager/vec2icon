/// <reference types="node" />
/**
 * `src/core` must stay framework-free and independent of app-level state/UI
 * (see design spec: "src/core must not import React or anything from
 * src/state or src/ui"). This is enforced here — rather than via a Biome
 * noRestrictedImports rule, which cannot reliably match relative-path
 * specifiers like `../../state/x` — by scanning source text for forbidden
 * import/require specifiers, per the task brief's stated fallback.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CORE_DIR = join(__dirname)

const FORBIDDEN_BARE_SPECIFIERS = [/^react$/, /^react-dom(\/|$)/, /^@\/state(\/|$)/, /^@\/ui(\/|$)/]

const IMPORT_SPECIFIER_RE =
  /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g

const listSourceFiles = (dir: string): string[] => {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...listSourceFiles(full))
    } else if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) {
      files.push(full)
    }
  }
  return files
}

const escapesCore = (fromFile: string, specifier: string): boolean => {
  if (!specifier.startsWith('.')) return false
  const resolved = new URL(specifier, `file://${fromFile}`).pathname
  return resolved !== CORE_DIR && !resolved.startsWith(`${CORE_DIR}/`)
}

describe('src/core isolation', () => {
  it('never imports react, react-dom, src/state, or src/ui', () => {
    const files = listSourceFiles(CORE_DIR)
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(IMPORT_SPECIFIER_RE)) {
        const specifier = match[1] ?? match[2]
        if (!specifier) continue
        const forbidden =
          FORBIDDEN_BARE_SPECIFIERS.some((re) => re.test(specifier)) || escapesCore(file, specifier)
        if (forbidden) violations.push(`${file}: "${specifier}"`)
      }
    }
    expect(violations).toEqual([])
  })
})
