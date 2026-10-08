import * as fs from 'node:fs'
import * as path from 'node:path'
import type {EnvFile, EnvSyncEntry} from '../lib/env.js'
import {compare, copyFromStore, copyToStore, DEFAULT_ENV_PATTERNS, scanAll, scanStore} from '../lib/env.js'
import {PATHS} from '../lib/paths.js'
import {getGithubRoot} from './config.js'

/**
 * Env files hold credentials, so nothing here ever returns their contents:
 * only where they are and whether the repo and store copies agree.
 */

export interface EnvEntry {
  /** `org/repo/relativePath` - identifies a file across machines. */
  key: string
  org: string
  relativePath: string
  repo: string
  state: EnvSyncEntry['state']
}

export interface EnvTransfer {
  key: string
  org: string
  /**
   * copied / would-copy: done, or would be in a dry run.
   * conflict: both sides differ and the file was not forced.
   * not-cloned: (pull) the repo is not on this machine yet.
   */
  outcome: 'conflict' | 'copied' | 'not-cloned' | 'would-copy'
  relativePath: string
  repo: string
}

export interface EnvTransferResult {
  copied: number
  githubRoot: string
  skipped: number
  store: string
  transfers: EnvTransfer[]
}

export interface EnvTransferOptions {
  dryRun?: boolean
  /** Overwrite differing files: all of them, or only the listed keys. */
  force?: boolean | readonly string[]
}

const keyOf = (file: EnvFile) => `${file.org}/${file.repo}/${file.relativePath}`
const describeFile = (file: EnvFile) => ({
  key: keyOf(file),
  org: file.org,
  relativePath: file.relativePath,
  repo: file.repo,
})

function isForced(force: EnvTransferOptions['force'], key: string): boolean {
  return force === true || (Array.isArray(force) && force.includes(key))
}

/** Every env file in the repos or the store, with its sync state. */
export function scanEnv({unsavedOnly = false} = {}): {entries: EnvEntry[]; githubRoot: string} {
  const githubRoot = getGithubRoot()
  const entries = scanAll(githubRoot, DEFAULT_ENV_PATTERNS)
    .map((file) => compare(file))
    .filter((entry) => !unsavedOnly || entry.state !== 'identical')
    .map((entry) => ({...describeFile(entry.file), state: entry.state}))
  return {entries, githubRoot}
}

function summarize(githubRoot: string, transfers: EnvTransfer[]): EnvTransferResult {
  const copied = transfers.filter((t) => t.outcome === 'copied' || t.outcome === 'would-copy').length
  return {copied, githubRoot, skipped: transfers.length - copied, store: PATHS.icloudEnvs, transfers}
}

/**
 * Copy env files from the repos into the store. A store copy that differs may
 * be newer work from the other machine, so it is only overwritten when forced.
 */
export function pushEnv({dryRun = false, force = false}: EnvTransferOptions = {}): EnvTransferResult {
  const githubRoot = getGithubRoot()
  const transfers: EnvTransfer[] = []

  for (const entry of scanAll(githubRoot, DEFAULT_ENV_PATTERNS).map((file) => compare(file))) {
    if (entry.state === 'identical' || entry.state === 'store-only') continue

    const described = describeFile(entry.file)
    if (entry.state === 'differs' && !isForced(force, described.key)) {
      transfers.push({...described, outcome: 'conflict'})
      continue
    }

    if (!dryRun) copyToStore(entry.file)
    transfers.push({...described, outcome: dryRun ? 'would-copy' : 'copied'})
  }

  return summarize(githubRoot, transfers)
}

/**
 * Restore env files from the store into the repos. Repos that are not cloned
 * yet are skipped rather than created as a tree of stray env files.
 */
export function pullEnv({dryRun = false, force = false}: EnvTransferOptions = {}): EnvTransferResult {
  const githubRoot = getGithubRoot()
  const transfers: EnvTransfer[] = []

  for (const file of scanStore(githubRoot)) {
    const described = describeFile(file)
    if (!fs.existsSync(path.join(githubRoot, file.org, file.repo))) {
      transfers.push({...described, outcome: 'not-cloned'})
      continue
    }

    const {state} = compare(file)
    if (state === 'identical') continue
    if (state === 'differs' && !isForced(force, described.key)) {
      transfers.push({...described, outcome: 'conflict'})
      continue
    }

    if (!dryRun) copyFromStore(file)
    transfers.push({...described, outcome: dryRun ? 'would-copy' : 'copied'})
  }

  return summarize(githubRoot, transfers)
}

/** True when the store holds no env files at all. */
export function envStoreIsEmpty(): boolean {
  return scanStore(getGithubRoot()).length === 0
}
