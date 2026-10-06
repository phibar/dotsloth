import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {PATHS} from './paths.js'

export const CLAUDE_DIR = path.join(os.homedir(), '.claude')

/** Where Claude Code state is mirrored inside the dotsloth iCloud folder. */
export const CLAUDE_STORE = path.join(PATHS.icloudDotsloth, 'claude')

/**
 * Paths under ~/.claude that must never be synced between machines.
 *
 * These are machine-local runtime state, not configuration. Syncing them
 * ranges from pointless to actively harmful: shell-snapshots and session-env
 * capture one machine's environment, ide holds a live editor handle, and the
 * caches are rebuildable derived data that would only generate conflicts.
 */
export const MACHINE_LOCAL = new Set([
  '.last-cleanup',
  '.last-update-result.json',
  'cache',
  'debug',
  'downloads',
  'file-history',
  'ide',
  'paste-cache',
  'session-env',
  'shell-snapshots',
  'stats-cache.json',
  'statsig',
  'telemetry',
])

/**
 * Config files that are safe to share verbatim between machines.
 *
 * settings.json is written atomically by Claude Code as a single small file,
 * which is what makes a symlink safe here — unlike the history files, which
 * are appended to continuously during a session.
 *
 * settings.local.json is deliberately absent: it is machine-local by design.
 */
export const SHARED_CONFIG_FILES = ['settings.json', 'CLAUDE.md']

export interface ClaudeConfigFile {
  existsInStore: boolean
  existsLocally: boolean
  /** Absolute path on this machine */
  localPath: string
  /** Path inside ~/.claude */
  name: string
  /** Absolute path in the dotsloth store */
  storePath: string
}

export function configFiles(names: string[] = SHARED_CONFIG_FILES): ClaudeConfigFile[] {
  return names.map((name) => {
    const localPath = path.join(CLAUDE_DIR, name)
    const storePath = path.join(CLAUDE_STORE, name)
    return {
      existsInStore: fs.existsSync(storePath),
      existsLocally: fs.existsSync(localPath),
      localPath,
      name,
      storePath,
    }
  })
}

/** True if a ~/.claude entry is machine-local and must not be synced. */
export function isMachineLocal(name: string): boolean {
  return MACHINE_LOCAL.has(name)
}

/**
 * Seed the store from this machine's config, for the first machine to adopt
 * syncing. Returns the files copied.
 */
export function seedStore(files: ClaudeConfigFile[]): ClaudeConfigFile[] {
  const seeded: ClaudeConfigFile[] = []
  for (const file of files) {
    if (!file.existsLocally || file.existsInStore) continue
    fs.mkdirSync(path.dirname(file.storePath), {recursive: true})
    // Copy, not move: the symlink step will replace the local copy, and a
    // failure between the two should not leave the machine without settings.
    fs.copyFileSync(file.localPath, file.storePath)
    seeded.push(file)
  }

  return seeded
}

export function claudeInstalled(): boolean {
  return fs.existsSync(CLAUDE_DIR)
}
