import * as fs from 'node:fs'
import * as path from 'node:path'

import type {ClaudeProject} from './claude-projects.js'

import {CLAUDE_DIR, CLAUDE_STORE} from './claude.js'

export const HISTORY_FILE = path.join(CLAUDE_DIR, 'history.jsonl')
export const HISTORY_STORE = path.join(CLAUDE_STORE, 'history')
export const SESSIONS_STORE = path.join(HISTORY_STORE, 'sessions')
export const SHARED_HISTORY = path.join(HISTORY_STORE, 'history.jsonl')

/**
 * A session file is only safe to copy once nothing is still writing to it.
 *
 * Session .jsonl files are append-only and become immutable when the session
 * ends, so a finished one copies with no conflict risk at all. The active one
 * is the single hazardous file, and mtime is how we tell them apart.
 */
export const ACTIVE_SESSION_MINUTES = 30

/** Default retention. 12MB of history today, and it only grows. */
export const DEFAULT_RETENTION_DAYS = 90

export interface HistoryEntry {
  display?: string
  project?: string
  sessionId?: string
  timestamp?: number
}

function parse(line: string): HistoryEntry | null {
  try {
    return JSON.parse(line) as HistoryEntry
  } catch {
    return null
  }
}

/**
 * Identity of a history line, for deduplication across machines.
 *
 * JSON-encoded rather than string-joined. A plain separator either collides
 * (timestamp 1 + session "23" is indistinguishable from 12 + "3") or has to be
 * a control character — and an escaped control character does not survive a
 * pass of `eslint --fix`, which rewrites it to a raw byte in the source.
 */
function entryKey(line: string, parsed: HistoryEntry | null): string {
  if (!parsed) return line
  return JSON.stringify([parsed.timestamp ?? null, parsed.sessionId ?? null, parsed.display ?? null])
}

/**
 * Merge two history logs by unioning lines and ordering by timestamp.
 *
 * This is why history cannot simply be symlinked into iCloud: the file is
 * appended to live, iCloud syncs whole files with no merge and no locking, so
 * two machines writing on the same day means one wins outright (or iCloud
 * writes a "history 2.jsonl" conflict copy) and the loser's lines are gone.
 * Merging line-wise is tractable precisely because the format is JSONL and
 * each line is independent.
 */
export function mergeHistory(a: string, b: string): string {
  const seen = new Set<string>()
  const entries: Array<{line: string; timestamp: number}> = []

  for (const line of [...a.split('\n'), ...b.split('\n')]) {
    if (line.trim() === '') continue
    const parsed = parse(line)
    const key = entryKey(line, parsed)
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({line, timestamp: parsed?.timestamp ?? 0})
  }

  // Stable by timestamp; unparseable lines (timestamp 0) sort first and are
  // preserved rather than dropped.
  entries.sort((x, y) => x.timestamp - y.timestamp)
  return entries.map((e) => e.line).join('\n') + '\n'
}

export interface SessionFile {
  /** Still being written to */
  active: boolean
  ageDays: number
  localPath: string
  name: string
  storePath: string
}

/**
 * Every session file for a project, from the local directory and the store.
 *
 * Both sides are unioned deliberately. Listing only the local directory meant
 * `pull` iterated an empty tree on a fresh machine and restored nothing - the
 * one scenario history sync exists for.
 */
export function sessionFiles(project: ClaudeProject, now = Date.now()): SessionFile[] {
  if (!project.key) return []

  const storeDir = path.join(SESSIONS_STORE, project.key)
  const names = new Set<string>()

  for (const dir of [project.projectDir, storeDir]) {
    try {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (entry.isFile() && entry.name.endsWith('.jsonl')) names.add(entry.name)
      }
    } catch {
      // Directory absent: expected for the store before a first push, and for
      // the local project dir on a machine that has not opened this repo yet.
    }
  }

  const files: SessionFile[] = []
  for (const name of names) {
    const localPath = path.join(project.projectDir, name)
    const storePath = path.join(storeDir, name)

    // Age and liveness describe the local file. A file that exists only in
    // the store is not being written here, so it is never "active" and its
    // age comes from the stored copy.
    let mtimeMs: number
    let active = false
    try {
      mtimeMs = fs.statSync(localPath).mtimeMs
      active = now - mtimeMs < ACTIVE_SESSION_MINUTES * 60 * 1000
    } catch {
      try {
        mtimeMs = fs.statSync(storePath).mtimeMs
      } catch {
        continue
      }
    }

    files.push({
      active,
      ageDays: (now - mtimeMs) / (24 * 60 * 60 * 1000),
      localPath,
      name,
      storePath,
    })
  }

  return files.sort((x, y) => x.name.localeCompare(y.name))
}

export function readIfExists(p: string): string {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}

export function writeAtomic(target: string, content: string): void {
  fs.mkdirSync(path.dirname(target), {recursive: true})
  // Write-then-rename: a crash mid-write must not truncate the history that
  // the merge was supposed to protect.
  const tmp = `${target}.tmp-${process.pid}`
  fs.writeFileSync(tmp, content, 'utf8')
  fs.renameSync(tmp, target)
}

export function copySession(file: SessionFile, direction: 'pull' | 'push'): void {
  const from = direction === 'push' ? file.localPath : file.storePath
  const to = direction === 'push' ? file.storePath : file.localPath
  fs.mkdirSync(path.dirname(to), {recursive: true})
  fs.copyFileSync(from, to)
}
