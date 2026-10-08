import * as fs from 'node:fs'
import * as path from 'node:path'

import {CLAUDE_DIR} from './claude.js'
import {tryRun} from './exec.js'
import {parseGitUrl} from './git.js'
import {findRepos} from './repo-audit.js'

export const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects')

/**
 * Claude Code's name for a project directory: the absolute path with every
 * non-alphanumeric character replaced by a dash.
 *
 * Verified against this machine, including the awkward cases:
 *   /Users/phibar/github/phibar/.github-private
 *     -> -Users-phibar-github-phibar--github-private   (the dot doubles the dash)
 *   /Users/phibar/github/phibar-work/phibar.work
 *     -> -Users-phibar-github-phibar-work-phibar-work
 */
export function slugify(absolutePath: string): string {
  return absolutePath.replaceAll(/[^A-Za-z0-9]/g, '-')
}

/**
 * The slug is lossy and MUST NOT be parsed back into a path.
 *
 * Both `/` and `.` and `-` all collapse to `-`, so
 * `-Users-phibar-github-phibar-work-phibar-work` could be phibar-work/phibar.work,
 * phibar/work/phibar/work, or several other trees. The only sound direction is
 * forward: enumerate the repos that actually exist on this machine, slugify
 * each, and match. That is why sync is keyed by git remote rather than by slug.
 */
export interface ClaudeProject {
  /** "phibar/dotsloth" — stable across machines */
  key: null | string
  /** Absolute checkout path on this machine */
  localPath: string
  /** ~/.claude/projects/<slug> */
  projectDir: string
  slug: string
}

function remoteKey(repoPath: string): null | string {
  const url = tryRun('git', ['-C', repoPath, 'remote', 'get-url', 'origin'])
  if (url === null) return null
  const parsed = parseGitUrl(url.trim())
  return parsed ? `${parsed.org}/${parsed.repo}` : null
}

/**
 * Pair the Claude project directories that exist on this machine with the
 * repos they belong to, keyed by git remote so the pairing survives a
 * different $HOME or checkout location on the other machine.
 */
export function discoverProjects(githubRoot: string): ClaudeProject[] {
  const projects: ClaudeProject[] = []
  if (!fs.existsSync(PROJECTS_DIR)) return projects

  const existingSlugs = new Set(
    fs
      .readdirSync(PROJECTS_DIR, {withFileTypes: true})
      .filter((d) => d.isDirectory())
      .map((d) => d.name),
  )

  for (const repoPath of findRepos(githubRoot)) {
    const slug = slugify(repoPath)
    if (!existingSlugs.has(slug)) continue
    projects.push({
      key: remoteKey(repoPath),
      localPath: repoPath,
      projectDir: path.join(PROJECTS_DIR, slug),
      slug,
    })
  }

  return projects
}

/** Resolve where a store key should live on *this* machine. */
export function localProjectDirFor(key: string, githubRoot: string): null | string {
  for (const repoPath of findRepos(githubRoot)) {
    if (remoteKey(repoPath) === key) return path.join(PROJECTS_DIR, slugify(repoPath))
  }

  return null
}
