import * as fs from 'node:fs'
import * as path from 'node:path'
import {run, runStreaming} from '../lib/exec.js'
import {parseGitUrl} from '../lib/git.js'
import type {SyncResult} from '../lib/sync.js'
import {runSync} from '../lib/sync.js'
import type {Organization} from '../types/index.js'
import {CoreError, requireConfig} from './errors.js'
import type {OnEvent} from './events.js'
import {ignoreEvents} from './events.js'
import {addOrg, getOrg, safeOrgFolder} from './orgs.js'

export interface ClonePlan {
  /** Where org folders live; the clone lands in <githubRoot>/<org folder>/<repo>. */
  githubRoot: string
  host: string
  /** The org the repository maps to, when one is configured. */
  org: null | Organization
  /** The org name from the URL, or the override. */
  orgName: string
  /** Configured orgs, to choose from when there is no match. */
  organizations: Organization[]
  repo: string
  url: string
}

/** Where a clone goes when the URL's org is not configured. */
export type CloneTarget =
  /** An existing org (by name). */
  | {kind: 'org'; name: string}
  /** Create the URL's org first, with this git identity. */
  | {gitEmail: string; gitUsername: string; kind: 'new-org'}
  /** Clone into a folder named after the URL's org, without org config. */
  | {kind: 'none'}

function parse(url: string): {host: string; org: string; repo: string} {
  const parsed = parseGitUrl(url.trim())
  if (!parsed) throw new CoreError('INVALID_INPUT', `Could not parse repository URL: ${url}`)
  return parsed
}

/** Work out where a URL would be cloned, and whether a decision is needed first. */
export function planClone(url: string, {org: override}: {org?: string} = {}): ClonePlan {
  const config = requireConfig()
  const parsed = parse(url)
  const orgName = override || parsed.org
  const org = config.organizations.find((o) => o.name.toLowerCase() === orgName.toLowerCase()) ?? null
  return {
    ...parsed,
    githubRoot: config.paths.githubRoot,
    org,
    orgName,
    organizations: config.organizations,
    url: url.trim(),
  }
}

export type CloneEvent =
  | {line: string; stream: 'stderr' | 'stdout'; type: 'output'}
  | {repoPath: string; type: 'cloning'; url: string}
  | {name: string; type: 'org-created'}

export interface CloneOptions {
  /** Required when the plan found no org for the URL. */
  target?: CloneTarget
  /**
   * Connect git to the terminal (CLI): it can ask for host keys or
   * credentials and draws its own progress. Otherwise output is streamed as
   * events and git is told never to prompt, so it fails instead of hanging.
   */
  interactive?: boolean
}

export interface CloneResult {
  createdOrg: boolean
  org: null | Organization
  repoPath: string
  sync: SyncResult
}

async function resolveTarget(
  plan: ClonePlan,
  target: CloneTarget | undefined,
  onEvent: OnEvent<CloneEvent>,
): Promise<{createdOrg: boolean; folder: string; org: null | Organization}> {
  if (plan.org) return {createdOrg: false, folder: plan.org.folderName, org: plan.org}

  if (!target) {
    throw new CoreError('ORG_NOT_FOUND', `Organization '${plan.orgName}' not configured`, [
      'Choose an existing org, create it, or clone without org config',
    ])
  }

  if (target.kind === 'org') {
    const org = getOrg(target.name)
    return {createdOrg: false, folder: org.folderName, org}
  }

  if (target.kind === 'new-org') {
    const {org} = await addOrg({gitEmail: target.gitEmail, gitUsername: target.gitUsername, name: plan.orgName})
    onEvent({name: org.name, type: 'org-created'})
    return {createdOrg: true, folder: org.folderName, org}
  }

  // No org config: a folder named after the URL's org.
  return {createdOrg: false, folder: plan.orgName, org: null}
}

/**
 * Clone a repository into its org folder, so the org's git identity applies
 * from the first commit. Syncs before cloning: the includeIf for a new org
 * must be in ~/.gitconfig before git creates the repository (#1).
 */
export async function clone(
  url: string,
  {interactive = false, org: override, target}: CloneOptions & {org?: string} = {},
  onEvent: OnEvent<CloneEvent> = ignoreEvents,
): Promise<CloneResult> {
  const plan = planClone(url, {org: override})
  const config = requireConfig()
  const resolved = await resolveTarget(plan, target, onEvent)

  const orgDir = safeOrgFolder(config.paths.githubRoot, resolved.folder)
  const repoPath = path.resolve(orgDir, plan.repo)
  // The repo part of a URL may contain slashes ("group/sub/repo") but must
  // never climb out of the org folder.
  if (!repoPath.startsWith(orgDir + path.sep)) {
    throw new CoreError('UNSAFE_PATH', `Refusing to clone outside ${orgDir}: ${plan.repo}`)
  }

  if (fs.existsSync(repoPath)) throw new CoreError('CONFLICT', `${repoPath} already exists`)

  fs.mkdirSync(path.dirname(repoPath), {recursive: true})
  const sync = await runSync()

  onEvent({repoPath, type: 'cloning', url: plan.url})
  const args = ['clone', '--', plan.url, repoPath]
  if (interactive) {
    try {
      run('git', args, {interactive: true})
    } catch {
      throw new CoreError('COMMAND_FAILED', 'Git clone failed')
    }
  } else {
    const lines: string[] = []
    const code = await runStreaming('git', ['clone', '--progress', '--', plan.url, repoPath], {
      env: {GIT_TERMINAL_PROMPT: '0'},
      onLine(line, stream) {
        lines.push(line)
        onEvent({line, stream, type: 'output'})
      },
    })
    if (code !== 0) throw new CoreError('COMMAND_FAILED', 'Git clone failed', lines.slice(-3))
  }

  return {createdOrg: resolved.createdOrg, org: resolved.org, repoPath, sync}
}
