import * as fs from 'node:fs'
import * as path from 'node:path'

import {PATHS} from './paths.js'

/**
 * Filename patterns that count as a machine-local env file.
 *
 * Deliberately not hardcoded to `.env*`: process-sync keeps a
 * `docker-compose.override.yml` whose own header says "NOT for commit". It has
 * exactly the lifecycle of a .env — gitignored, machine-specific, unrecoverable
 * once the disk is gone — so the matcher is a configurable list (#2).
 */
export const DEFAULT_ENV_PATTERNS = ['.env', '.env.*', '*.local.env', 'docker-compose.override.yml']

/** Suffixes that look like env files but are committed templates, not secrets. */
export const TEMPLATE_SUFFIXES = ['.example', '.sample', '.template', '.dist']

/** Directories never worth walking into. */
export const SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
  'vendor',
])

export interface EnvFile {
  /** Absolute path on this machine */
  absolutePath: string
  /** Org folder name, e.g. "phibar-work" */
  org: string
  /** Path inside the repo, e.g. "apps/web/.env" */
  relativePath: string
  /** Repo folder name, e.g. "process-sync" */
  repo: string
}

function matchesPattern(name: string, pattern: string): boolean {
  if (!pattern.includes('*')) return name === pattern
  const escaped = pattern.replaceAll('.', String.raw`\.`).replaceAll('*', '.*')
  return new RegExp(`^${escaped}$`).test(name)
}

/** True for a template like `.env.example`, which belongs in git, not the store. */
export function isTemplate(name: string): boolean {
  return TEMPLATE_SUFFIXES.some((suffix) => name.endsWith(suffix))
}

export function isEnvFile(name: string, patterns: string[] = DEFAULT_ENV_PATTERNS): boolean {
  if (isTemplate(name)) return false
  return patterns.some((p) => matchesPattern(name, p))
}

/**
 * Recursively find env files in one repo.
 *
 * Recursion matters: `phibar/coins` has an env at the repo root *and* another
 * at `apps/web/`, so a top-level-only scan silently loses half a monorepo's
 * configuration.
 */
export function scanRepo(repoPath: string, org: string, repo: string, patterns = DEFAULT_ENV_PATTERNS): EnvFile[] {
  const found: EnvFile[] = []

  const walk = (dir: string) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true})
    } catch {
      return
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full)
      } else if (entry.isFile() && isEnvFile(entry.name, patterns)) {
        found.push({absolutePath: full, org, relativePath: path.relative(repoPath, full), repo})
      }
    }
  }

  walk(repoPath)
  return found.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

/** Scan every repo under the github root, grouped org/repo. */
export function scanAll(githubRoot: string = PATHS.githubRoot, patterns = DEFAULT_ENV_PATTERNS): EnvFile[] {
  const results: EnvFile[] = []
  let orgs: fs.Dirent[]
  try {
    orgs = fs.readdirSync(githubRoot, {withFileTypes: true})
  } catch {
    return results
  }

  for (const orgEntry of orgs) {
    if (!orgEntry.isDirectory() || orgEntry.name.startsWith('.')) continue
    const orgPath = path.join(githubRoot, orgEntry.name)

    let repos: fs.Dirent[]
    try {
      repos = fs.readdirSync(orgPath, {withFileTypes: true})
    } catch {
      continue
    }

    for (const repoEntry of repos) {
      if (!repoEntry.isDirectory() || repoEntry.name.startsWith('.')) continue
      const repoPath = path.join(orgPath, repoEntry.name)
      if (!fs.existsSync(path.join(repoPath, '.git'))) continue
      results.push(...scanRepo(repoPath, orgEntry.name, repoEntry.name, patterns))
    }
  }

  return results
}

/** Where a given env file lives in the iCloud store. Mirrors org/repo/relative path. */
export function storePathFor(file: EnvFile): string {
  return path.join(PATHS.icloudEnvs, file.org, file.repo, file.relativePath)
}

export interface EnvSyncEntry {
  file: EnvFile
  /** 'local-only' | 'store-only' | 'identical' | 'differs' */
  state: 'differs' | 'identical' | 'local-only' | 'store-only'
  storePath: string
}

function readOrNull(p: string): Buffer | null {
  try {
    return fs.readFileSync(p)
  } catch {
    return null
  }
}

export function compare(file: EnvFile): EnvSyncEntry {
  const storePath = storePathFor(file)
  const local = readOrNull(file.absolutePath)
  const stored = readOrNull(storePath)

  let state: EnvSyncEntry['state']
  if (local && !stored) state = 'local-only'
  else if (!local && stored) state = 'store-only'
  else if (local && stored) state = local.equals(stored) ? 'identical' : 'differs'
  else state = 'local-only'

  return {file, state, storePath}
}

export function copyToStore(file: EnvFile): string {
  const dest = storePathFor(file)
  fs.mkdirSync(path.dirname(dest), {recursive: true})
  fs.copyFileSync(file.absolutePath, dest)
  // Env files are secrets even in iCloud; don't leave them group/world readable.
  fs.chmodSync(dest, 0o600)
  return dest
}

export function copyFromStore(file: EnvFile): string {
  const source = storePathFor(file)
  fs.mkdirSync(path.dirname(file.absolutePath), {recursive: true})
  fs.copyFileSync(source, file.absolutePath)
  fs.chmodSync(file.absolutePath, 0o600)
  return file.absolutePath
}

/** Env files present in the store but not yet on this machine (post-reinstall restore). */
export function scanStore(githubRoot: string = PATHS.githubRoot): EnvFile[] {
  const found: EnvFile[] = []
  const root = PATHS.icloudEnvs
  if (!fs.existsSync(root)) return found

  for (const org of fs.readdirSync(root, {withFileTypes: true})) {
    if (!org.isDirectory()) continue
    for (const repo of fs.readdirSync(path.join(root, org.name), {withFileTypes: true})) {
      if (!repo.isDirectory()) continue
      const repoStore = path.join(root, org.name, repo.name)
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) walk(full)
          else if (entry.isFile()) {
            const relativePath = path.relative(repoStore, full)
            found.push({
              absolutePath: path.join(githubRoot, org.name, repo.name, relativePath),
              org: org.name,
              relativePath,
              repo: repo.name,
            })
          }
        }
      }

      walk(repoStore)
    }
  }

  return found
}
