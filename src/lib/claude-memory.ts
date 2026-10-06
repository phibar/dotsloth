import * as fs from 'node:fs'
import * as path from 'node:path'

import type {ClaudeProject} from './claude-projects.js'

import {CLAUDE_STORE} from './claude.js'

export const MEMORY_STORE = path.join(CLAUDE_STORE, 'memory')

export interface MemoryFile {
  localPath: string
  name: string
  storePath: string
}

export interface MemorySet {
  files: MemoryFile[]
  key: string
  localDir: string
  storeDir: string
}

function listFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, {withFileTypes: true})
      .filter((d) => d.isFile() && d.name.endsWith('.md'))
      .map((d) => d.name)
      .sort()
  } catch {
    return []
  }
}

/** The memory directory for one project, local and in the store. */
export function memorySetFor(project: ClaudeProject): MemorySet | null {
  if (!project.key) return null
  const localDir = path.join(project.projectDir, 'memory')
  const storeDir = path.join(MEMORY_STORE, project.key)

  const names = new Set([...listFiles(localDir), ...listFiles(storeDir)])
  return {
    files: [...names].sort().map((name) => ({
      localPath: path.join(localDir, name),
      name,
      storePath: path.join(storeDir, name),
    })),
    key: project.key,
    localDir,
    storeDir,
  }
}

export type MemoryState = 'differs' | 'identical' | 'local-only' | 'store-only'

export function stateOf(file: MemoryFile): MemoryState {
  const localExists = fs.existsSync(file.localPath)
  const storeExists = fs.existsSync(file.storePath)
  if (localExists && !storeExists) return 'local-only'
  if (!localExists && storeExists) return 'store-only'
  if (!localExists && !storeExists) return 'local-only'
  return fs.readFileSync(file.localPath).equals(fs.readFileSync(file.storePath)) ? 'identical' : 'differs'
}

/**
 * Newest-wins is sound for the per-fact files but NOT for MEMORY.md.
 *
 * Each memory is one file holding one fact, so two machines almost always
 * touch disjoint files and last-write-wins loses nothing. MEMORY.md is the
 * single shared index every machine appends a line to, so it is the one file
 * that genuinely conflicts — we never silently overwrite it.
 */
export const INDEX_FILE = 'MEMORY.md'

export function isIndex(file: MemoryFile): boolean {
  return file.name === INDEX_FILE
}

/** Merge two MEMORY.md indexes by unioning their bullet lines, preserving order. */
export function mergeIndex(local: string, store: string): string {
  const seen = new Set<string>()
  const merged: string[] = []

  for (const line of [...store.split('\n'), ...local.split('\n')]) {
    const key = line.trim()
    if (key === '') {
      // Collapse runs of blank lines rather than accumulating them each merge.
      if (merged.at(-1) !== '') merged.push('')
      continue
    }

    if (seen.has(key)) continue
    seen.add(key)
    merged.push(line)
  }

  return merged.join('\n').replace(/\n+$/, '\n')
}

export function copyFile(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), {recursive: true})
  fs.copyFileSync(from, to)
}

export function writeFile(to: string, content: string): void {
  fs.mkdirSync(path.dirname(to), {recursive: true})
  fs.writeFileSync(to, content, 'utf8')
}
