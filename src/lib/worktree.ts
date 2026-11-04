/*
 * Purpose: Create, list, and clean git worktrees linked to GitHub issues.
 * Intention: uses runAsync from exec, isRepo from repo-audit.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import {runAsync} from './exec.js'

export interface WorktreeInfo {
  branch: string
  issue: null | number
  path: string
  repoPath: string
}

export interface WorktreeNewOptions {
  issue: number
  repoPath: string
}

export interface WorktreeNewResult {
  branch: string
  path: string
}

export interface WorktreeCleanResult {
  kept: WorktreeInfo[]
  removed: WorktreeInfo[]
  skipped: WorktreeInfo[]
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 50)
}

function parseIssueNumber(branch: string): null | number {
  const match = /(?:^|\/)(\d+)-/.exec(branch)
  return match ? Number.parseInt(match[1], 10) : null
}

async function git(repoPath: string, args: string[]): Promise<string> {
  try {
    return (await runAsync('git', ['-C', repoPath, ...args])).trim()
  } catch {
    return ''
  }
}

async function fetchIssueTitle(issue: number): Promise<string> {
  try {
    const title = await runAsync('gh', ['issue', 'view', String(issue), '--json', 'title', '--jq', '.title'])
    return title.trim()
  } catch {
    return String(issue)
  }
}

async function isBranchMerged(repoPath: string, branch: string): Promise<boolean> {
  const defaultBranch = (await git(repoPath, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])).replace(
    'origin/',
    '',
  )
  const base = defaultBranch || 'main'
  const merged = await git(repoPath, ['branch', '--merged', `origin/${base}`, '--list', branch])
  return merged.trim().length > 0
}

export async function listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
  const raw = await git(repoPath, ['worktree', 'list', '--porcelain'])
  if (!raw) return []

  const worktrees: WorktreeInfo[] = []
  const blocks = raw.split('\n\n').filter(Boolean)

  for (const block of blocks) {
    const lines = block.split('\n')
    const wtPath = lines.find((l) => l.startsWith('worktree '))?.slice(9) ?? ''
    const branch =
      lines
        .find((l) => l.startsWith('branch '))
        ?.slice(7)
        .replace('refs/heads/', '') ?? ''

    // Skip the main worktree (same path as repoPath)
    if (wtPath === repoPath) continue
    if (!wtPath || !branch) continue

    worktrees.push({
      branch,
      issue: parseIssueNumber(branch),
      path: wtPath,
      repoPath,
    })
  }

  return worktrees
}

export async function newWorktree({repoPath, issue}: WorktreeNewOptions): Promise<WorktreeNewResult> {
  const title = await fetchIssueTitle(issue)
  const slug = slugify(title)
  const branch = `feature/${issue}-${slug}`
  const wtPath = path.join(repoPath, '.worktrees', `${issue}-${slug}`)

  fs.mkdirSync(path.join(repoPath, '.worktrees'), {recursive: true})
  await runAsync('git', ['-C', repoPath, 'worktree', 'add', '-b', branch, wtPath])

  return {branch, path: wtPath}
}

export async function checkMerged(repoPath: string, branch: string): Promise<boolean> {
  return isBranchMerged(repoPath, branch)
}

export async function cleanWorktrees(repoPath: string): Promise<WorktreeCleanResult> {
  const worktrees = await listWorktrees(repoPath)
  const mergedFlags = await Promise.all(worktrees.map((wt) => isBranchMerged(repoPath, wt.branch)))
  const result: WorktreeCleanResult = {kept: [], removed: [], skipped: []}

  for (const [i, wt] of worktrees.entries()) {
    if (!mergedFlags[i]) {
      result.kept.push(wt)
      continue
    }

    try {
      // biome-ignore lint/performance/noAwaitInLoops: sequential — parallel worktree removes corrupt git internals
      await runAsync('git', ['-C', repoPath, 'worktree', 'remove', '--force', wt.path])
      await runAsync('git', ['-C', repoPath, 'branch', '-d', wt.branch]).catch(() => null)
      result.removed.push(wt)
    } catch {
      result.skipped.push(wt)
    }
  }

  // Prune stale worktree admin files
  await git(repoPath, ['worktree', 'prune'])

  return result
}
