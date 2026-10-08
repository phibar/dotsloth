import * as fs from 'node:fs'
import {CLAUDE_STORE, claudeInstalled, configFiles, SHARED_CONFIG_FILES, seedStore} from '../lib/claude.js'
import {
  copySession,
  DEFAULT_RETENTION_DAYS,
  HISTORY_FILE,
  HISTORY_STORE,
  mergeHistory,
  readIfExists,
  SHARED_HISTORY,
  sessionFiles,
  writeAtomic,
} from '../lib/claude-history.js'
import type {MemoryFile, MemoryState} from '../lib/claude-memory.js'
import {copyFile, isIndex, MEMORY_STORE, memorySetFor, mergeIndex, stateOf, writeFile} from '../lib/claude-memory.js'
import {discoverProjects} from '../lib/claude-projects.js'
import {saveConfig} from '../lib/config.js'
import {checkSymlink, createSymlink} from '../lib/symlink.js'
import type {SymlinkStatus} from '../types/index.js'
import {getGithubRoot} from './config.js'
import {CoreError, requireConfig} from './errors.js'
import type {OnEvent} from './events.js'
import {ignoreEvents} from './events.js'

export {ACTIVE_SESSION_MINUTES, DEFAULT_RETENTION_DAYS} from '../lib/claude-history.js'

function requireClaude(): void {
  if (!claudeInstalled()) throw new CoreError('NOT_FOUND', '~/.claude not found — is Claude Code installed?')
}

// --- Shared settings (symlinked) ---------------------------------------------

export interface ClaudeFileStatus {
  localPath: string
  name: string
  /** shared: linked to the store. absent: on neither side. */
  state: 'absent' | 'local-only' | 'shared' | 'store-only'
  storePath: string
}

export interface ClaudeStatus {
  files: ClaudeFileStatus[]
  installed: boolean
  store: string
}

export function getClaudeStatus(): ClaudeStatus {
  if (!claudeInstalled()) return {files: [], installed: false, store: CLAUDE_STORE}

  const files = configFiles(SHARED_CONFIG_FILES).map((file): ClaudeFileStatus => {
    const base = {localPath: file.localPath, name: file.name, storePath: file.storePath}
    if (!file.existsLocally && !file.existsInStore) return {...base, state: 'absent'}
    if (checkSymlink(file.storePath, file.localPath).isValid) return {...base, state: 'shared'}
    return {...base, state: fs.existsSync(file.localPath) ? 'local-only' : 'store-only'}
  })
  return {files, installed: true, store: CLAUDE_STORE}
}

export type ClaudeLinkEvent =
  | {name: string; type: 'seeded'}
  | {name: string; type: 'skipped'}
  | {localPath: string; name: string; storePath: string; type: 'would-link'}
  | {name: string; result: SymlinkStatus; type: 'linked'}

/**
 * Symlink the shared settings files to the store, seeding the store from this
 * machine when it is the first to share them. Links are recorded in the
 * config, so `dotsloth sync` re-establishes them on a new machine.
 */
export async function linkClaude(
  {dryRun = false} = {},
  onEvent: OnEvent<ClaudeLinkEvent> = ignoreEvents,
): Promise<ClaudeLinkEvent[]> {
  requireClaude()
  const config = requireConfig()
  const events: ClaudeLinkEvent[] = []
  const emit = (event: ClaudeLinkEvent) => {
    events.push(event)
    onEvent(event)
  }

  if (!dryRun) {
    for (const seeded of seedStore(configFiles(SHARED_CONFIG_FILES))) emit({name: seeded.name, type: 'seeded'})
  }

  for (const file of configFiles(SHARED_CONFIG_FILES)) {
    if (!file.existsInStore && !file.existsLocally) {
      emit({name: file.name, type: 'skipped'})
    } else if (dryRun) {
      emit({localPath: file.localPath, name: file.name, storePath: file.storePath, type: 'would-link'})
    } else {
      // biome-ignore lint/performance/noAwaitInLoops: sequential on purpose, each link reports its own line
      const result = await createSymlink({backup: true, source: file.storePath, target: file.localPath})
      emit({name: file.name, result, type: 'linked'})
      if (result.isValid && !config.syncedFiles.some((f) => f.target === file.localPath)) {
        config.syncedFiles.push({source: file.storePath, target: file.localPath})
      }
    }
  }

  if (!dryRun) saveConfig(config)
  return events
}

// --- Project memory (copied and merged, never symlinked) ---------------------

export type SyncDirection = 'pull' | 'push'

export interface MemoryFilePlan {
  /**
   * copy: plain copy. merge: MEMORY.md, which both machines append to, is
   * merged rather than overwritten. nothing-to-copy: the source side is missing.
   */
  action: 'copy' | 'merge' | 'nothing-to-copy'
  name: string
  state: Exclude<MemoryState, 'identical'>
}

export interface MemoryPlan {
  /** Files that differ (status) or would change (push/pull). */
  changes: number
  projects: Array<{files: MemoryFilePlan[]; key: string}>
  store: string
  /** Projects without a git remote to key them by across machines. */
  unkeyed: number
}

interface MemoryWork {
  file: MemoryFile
  item: MemoryFilePlan
}

function memoryAction(
  file: MemoryFile,
  state: MemoryFilePlan['state'],
  direction: 'status' | SyncDirection,
): MemoryFilePlan['action'] {
  const source = direction === 'pull' ? file.storePath : file.localPath
  if (direction !== 'status' && !fs.existsSync(source)) return 'nothing-to-copy'
  return isIndex(file) && state === 'differs' ? 'merge' : 'copy'
}

function planMemory(direction: 'status' | SyncDirection): {plan: MemoryPlan; work: MemoryWork[]} {
  const plan: MemoryPlan = {changes: 0, projects: [], store: MEMORY_STORE, unkeyed: 0}
  const work: MemoryWork[] = []

  for (const project of discoverProjects(getGithubRoot())) {
    const set = memorySetFor(project)
    if (!set) {
      plan.unkeyed++
      continue
    }

    const files: MemoryFilePlan[] = []
    for (const file of set.files) {
      const state = stateOf(file)
      if (state === 'identical') continue

      const action = memoryAction(file, state, direction)
      const item = {action, name: file.name, state}
      files.push(item)
      work.push({file, item})
      if (direction === 'status' || action !== 'nothing-to-copy') plan.changes++
    }

    if (files.length > 0) plan.projects.push({files, key: set.key})
  }

  return {plan, work}
}

/** Which memory files are out of sync (status), or what a push/pull would change. */
export function planMemorySync(direction: 'status' | SyncDirection = 'status'): MemoryPlan {
  return planMemory(direction).plan
}

export function applyMemorySync(direction: SyncDirection): MemoryPlan {
  const {plan, work} = planMemory(direction)

  for (const {file, item} of work) {
    if (item.action === 'merge') {
      const merged = mergeIndex(readIfExists(file.localPath), readIfExists(file.storePath))
      writeFile(file.localPath, merged)
      writeFile(file.storePath, merged)
    } else if (item.action === 'copy') {
      const [from, to] = direction === 'push' ? [file.localPath, file.storePath] : [file.storePath, file.localPath]
      copyFile(from, to)
    }
  }

  return plan
}

// --- Conversation history ------------------------------------------------------

const countLines = (content: string) => content.split('\n').filter(Boolean).length

export interface HistoryPlan {
  /** history.jsonl, the log both machines append to: always merged. */
  log: {localEntries: number; mergedEntries: number; storeEntries: number}
  /** Session files that exist on the source side only. */
  projects: Array<{files: string[]; key: string}>
  retentionDays: number
  sessionCount: number
  /** Sessions modified in the last ACTIVE_SESSION_MINUTES - possibly still being written. */
  skippedActive: number
  skippedOld: number
  store: string
}

function planHistory(direction: 'status' | SyncDirection, retentionDays: number) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new CoreError('INVALID_INPUT', 'Retention must be a whole number of days, at least 1')
  }

  const plan: HistoryPlan = {
    log: {localEntries: 0, mergedEntries: 0, storeEntries: 0},
    projects: [],
    retentionDays,
    sessionCount: 0,
    skippedActive: 0,
    skippedOld: 0,
    store: HISTORY_STORE,
  }
  const sessions: ReturnType<typeof sessionFiles> = []

  for (const project of discoverProjects(getGithubRoot())) {
    const pending = sessionFiles(project).filter((f) => {
      if (f.ageDays > retentionDays) {
        plan.skippedOld++
        return false
      }

      // Never touch a file something may still be appending to. A finished
      // session is immutable, which is what makes copying it safe at all.
      if (f.active) {
        plan.skippedActive++
        return false
      }

      const [from, to] = direction === 'pull' ? [f.storePath, f.localPath] : [f.localPath, f.storePath]
      return fs.existsSync(from) && !fs.existsSync(to)
    })

    if (pending.length === 0) continue
    plan.projects.push({files: pending.map((f) => f.name), key: project.key ?? project.slug})
    plan.sessionCount += pending.length
    sessions.push(...pending)
  }

  const local = readIfExists(HISTORY_FILE)
  const stored = readIfExists(SHARED_HISTORY)
  const merged = mergeHistory(local, stored)
  plan.log = {localEntries: countLines(local), mergedEntries: countLines(merged), storeEntries: countLines(stored)}

  return {merged, plan, sessions}
}

/** Which sessions are missing on the other side, and what merging the shared log would give. */
export function planHistorySync(
  direction: 'status' | SyncDirection = 'status',
  {retentionDays = DEFAULT_RETENTION_DAYS} = {},
): HistoryPlan {
  return planHistory(direction, retentionDays).plan
}

export function applyHistorySync(direction: SyncDirection, {retentionDays = DEFAULT_RETENTION_DAYS} = {}): HistoryPlan {
  const {merged, plan, sessions} = planHistory(direction, retentionDays)

  for (const file of sessions) copySession(file, direction)

  // Merge rather than copy in either direction: this file is the one both
  // machines append to, so a plain overwrite always loses one side.
  writeAtomic(SHARED_HISTORY, merged)
  if (direction === 'pull') writeAtomic(HISTORY_FILE, merged)

  return plan
}
