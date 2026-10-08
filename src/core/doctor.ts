import * as path from 'node:path'
import {pendingUploads} from '../lib/icloud.js'
import type {BranchFinding} from '../lib/repo-audit.js'
import {auditRepo, findRepos, isAtRisk} from '../lib/repo-audit.js'
import {getGithubRoot} from './config.js'
import type {EnvEntry} from './env.js'
import {scanEnv} from './env.js'
import type {OnEvent} from './events.js'
import {ignoreEvents} from './events.js'

/** A repository with something that exists only on this machine. */
export interface RepoAtRisk {
  /** Branches worth reporting: unpushed or orphaned, and not already merged. */
  branches: BranchFinding[]
  /** Uncommitted changes, including untracked files that are not env files. */
  dirty: number
  path: string
  /** Path under the GitHub root, e.g. "acme/web". */
  relativePath: string
  stashes: number
}

export interface DoctorReport {
  /** Env files that are not in the store, or differ from it. */
  envFiles: EnvEntry[]
  githubRoot: string
  /** Files in the dotsloth iCloud folder that have not uploaded yet. */
  icloudPending: number
  /** Number of areas (each repo at risk, env files, iCloud) that need attention. */
  problems: number
  repoCount: number
  repos: RepoAtRisk[]
  /** True when nothing would be lost by wiping this machine. */
  safe: boolean
}

export type DoctorEvent =
  | {githubRoot: string; offline: boolean; repoCount: number; type: 'start'}
  /** One repository checked; `repo` is set when it is at risk. */
  | {done: number; path: string; repo: null | RepoAtRisk; total: number; type: 'repo'}

function reportable(branch: BranchFinding): boolean {
  return (branch.unpushed > 0 || branch.upstreamGone) && branch.risk !== 'merged'
}

/**
 * Check whether anything would be lost if this machine were wiped: work that
 * is not pushed, env files that are not backed up, iCloud uploads in flight.
 * Reads only. Repositories are audited one at a time and reported as they finish.
 */
export async function runDoctor(
  {offline = false} = {},
  onEvent: OnEvent<DoctorEvent> = ignoreEvents,
): Promise<DoctorReport> {
  const githubRoot = getGithubRoot()
  const repoPaths = findRepos(githubRoot)
  onEvent({githubRoot, offline, repoCount: repoPaths.length, type: 'start'})

  const repos: RepoAtRisk[] = []
  for (const [index, repoPath] of repoPaths.entries()) {
    // biome-ignore lint/performance/noAwaitInLoops: one repo at a time, so progress is reported in order and gh is not flooded
    const audit = await auditRepo(repoPath, {offline})
    const repo = isAtRisk(audit)
      ? {
          branches: audit.branches.filter((b) => reportable(b)),
          dirty: audit.dirty,
          path: audit.path,
          relativePath: path.relative(githubRoot, audit.path),
          stashes: audit.stashes,
        }
      : null
    if (repo) repos.push(repo)
    onEvent({done: index + 1, path: repoPath, repo, total: repoPaths.length, type: 'repo'})
  }

  const envFiles = scanEnv().entries.filter((e) => e.state === 'local-only' || e.state === 'differs')
  const icloudPending = pendingUploads().length
  const problems = repos.length + (envFiles.length > 0 ? 1 : 0) + (icloudPending > 0 ? 1 : 0)

  return {envFiles, githubRoot, icloudPending, problems, repoCount: repoPaths.length, repos, safe: problems === 0}
}
