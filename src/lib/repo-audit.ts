import * as fs from 'node:fs'
import * as path from 'node:path'

import {isEnvFile} from './env.js'
import {runAsync} from './exec.js'

export type BranchRisk = 'local-only' | 'merged' | 'unknown'

export interface BranchFinding {
  name: string
  /** Explanation, e.g. "PR #370 MERGED" */
  reason: string
  /** Whether those commits are safe to lose */
  risk: BranchRisk
  /** Commits on this branch that exist on no remote */
  unpushed: number
  /** Upstream is configured but deleted on the remote */
  upstreamGone: boolean
}

export interface RepoAudit {
  branches: BranchFinding[]
  /** Working-tree changes, including untracked */
  dirty: number
  name: string
  path: string
  stashes: number
}

/** Output of a git command, or '' when it fails. Async, so a long audit never blocks a server. */
async function git(repoPath: string, args: string[]): Promise<string> {
  try {
    return (await runAsync('git', ['-C', repoPath, ...args])).trim()
  } catch {
    return ''
  }
}

export function isRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.git'))
}

/** Find every git repo under githubRoot (org/repo layout, two levels deep). */
export function findRepos(githubRoot: string): string[] {
  const repos: string[] = []
  let orgs: fs.Dirent[]
  try {
    orgs = fs.readdirSync(githubRoot, {withFileTypes: true})
  } catch {
    return repos
  }

  for (const org of orgs) {
    if (!org.isDirectory() || org.name.startsWith('.')) continue
    const orgPath = path.join(githubRoot, org.name)
    if (isRepo(orgPath)) {
      repos.push(orgPath)
      continue
    }

    let children: fs.Dirent[]
    try {
      children = fs.readdirSync(orgPath, {withFileTypes: true})
    } catch {
      continue
    }

    for (const child of children) {
      if (!child.isDirectory()) continue
      const repoPath = path.join(orgPath, child.name)
      if (isRepo(repoPath)) repos.push(repoPath)
    }
  }

  return repos.sort()
}

/**
 * Classify a branch's unpushed commits using the GitHub API.
 *
 * This check cannot be done with git alone. A squash-merged PR rewrites its
 * commits into a single new commit on main, so the original branch's SHAs
 * genuinely exist on no remote — `git rev-list --not --remotes` reports them
 * as unpushed and is *correct*, but the work is safely merged. Only the PR
 * state distinguishes "merged, discard freely" from "local-only, about to be
 * destroyed". During the reinstall audit this separated 20 safe branches from
 * 3 carrying 55 commits that existed nowhere else.
 */
async function classifyBranch(repoPath: string, branch: string): Promise<{reason: string; risk: BranchRisk}> {
  let raw = ''
  try {
    raw = (
      await runAsync('gh', ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number,state'], {
        cwd: repoPath,
      })
    ).trim()
  } catch {
    return {reason: 'could not reach GitHub', risk: 'unknown'}
  }

  try {
    const prs = JSON.parse(raw) as Array<{number: number; state: string}>
    const merged = prs.find((p) => p.state === 'MERGED')
    if (merged) return {reason: `PR #${merged.number} MERGED`, risk: 'merged'}
    if (prs.length > 0) {
      return {reason: `PR #${prs[0].number} ${prs[0].state} — not merged`, risk: 'local-only'}
    }

    return {reason: 'no PR found', risk: 'local-only'}
  } catch {
    return {reason: 'could not parse GitHub response', risk: 'unknown'}
  }
}

export interface AuditOptions {
  /** Skip the GitHub PR lookups (fast, but cannot tell merged from local-only) */
  offline?: boolean
}

export async function auditRepo(repoPath: string, options: AuditOptions = {}): Promise<RepoAudit> {
  // An untracked file that the env store already backs up is not at risk, and
  // counting it here as well as under "env files" meant doctor could never
  // reach zero: backing it up cleared one line and left the other standing.
  const dirty = (await git(repoPath, ['status', '--porcelain']))
    .split('\n')
    .filter(Boolean)
    .filter((line) => {
      const untracked = line.startsWith('??')
      if (!untracked) return true
      const name = path.basename(line.slice(3).trim())
      return !isEnvFile(name)
    }).length
  const stashes = (await git(repoPath, ['stash', 'list'])).split('\n').filter(Boolean).length

  const refs = await git(repoPath, [
    'for-each-ref',
    '--format=%(refname:short)\t%(upstream:short)\t%(upstream:track)',
    'refs/heads',
  ])
  const branches: BranchFinding[] = []

  for (const line of refs.split('\n').filter(Boolean)) {
    const [name, , track] = line.split('\t')
    // biome-ignore lint/performance/noAwaitInLoops: one branch at a time keeps gh lookups from bursting
    const unpushed = Number((await git(repoPath, ['rev-list', '--count', name, '--not', '--remotes'])) || '0')
    const upstreamGone = (track ?? '').includes('gone')

    // A branch with no upstream but nothing unpushed is fine: its commits are
    // already reachable from some remote ref.
    if (unpushed === 0 && !upstreamGone) continue

    const {reason, risk} =
      unpushed > 0 && !options.offline
        ? await classifyBranch(repoPath, name)
        : {reason: upstreamGone ? 'upstream deleted on remote' : 'not checked', risk: 'unknown' as BranchRisk}

    branches.push({name, reason, risk, unpushed, upstreamGone})
  }

  return {branches, dirty, name: path.basename(repoPath), path: repoPath, stashes}
}

/** A repo is unsafe to wipe if anything here would not survive. */
export function isAtRisk(audit: RepoAudit): boolean {
  return audit.dirty > 0 || audit.stashes > 0 || audit.branches.some((b) => b.unpushed > 0 && b.risk !== 'merged')
}
