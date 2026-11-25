import * as fs from 'node:fs'
import {z} from 'zod'
import {ExecError, runAsync} from '../lib/exec.js'
import {parseGitUrl} from '../lib/git.js'
import type {SyncResult} from '../lib/sync.js'
import {runSync} from '../lib/sync.js'
import type {TopicsResult} from '../lib/topics.js'
import {runTopicsSync} from '../lib/topics.js'
import type {Organization} from '../types/index.js'
import type {CloneEvent, CloneTarget} from './clone.js'
import {gitClone, repoPathIn, resolveTarget} from './clone.js'
import {CoreError, requireConfig} from './errors.js'
import type {OnEvent} from './events.js'
import {ignoreEvents} from './events.js'
import {safeOrgFolder} from './orgs.js'

/**
 * Purpose: bring an organisation's repositories onto the machine in one run
 * — all of them, or those carrying given topics — each in its org folder.
 *
 * Intention: uses `gh repo list` for what the organisation holds and
 * core/clone for the target org and each clone; speaks to the clone command
 * and the web API.
 */
export interface OrgRepo {
  archived: boolean
  fork: boolean
  /** True when the repository is already in the org folder; it is skipped. */
  local: boolean
  name: string
  repoPath: string
  sshUrl: string
  topics: string[]
}

export interface OrgCloneFilter {
  /** Clone archived repositories too. */
  includeArchived?: boolean
  /** Clone forks too. */
  includeForks?: boolean
  /** The configured org to clone into, in place of the one named like the owner. */
  org?: string
  /** A repository matches when it carries any of these; none means every repository. */
  topics?: string[]
}

export interface OrgClonePlan {
  /** The org the repositories map to, when one is configured. */
  org: null | Organization
  /** The owner, or the override. */
  orgName: string
  /** Configured orgs, to choose from when there is no match. */
  organizations: Organization[]
  owner: string
  /** The repositories the filter matches, by name. */
  repos: OrgRepo[]
}

// GitHub's rule for a user or organisation login. It also keeps an owner
// such as `--help` from being read by gh as an option.
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/

const GhRepos = z.array(
  z.object({
    isArchived: z.boolean(),
    isFork: z.boolean(),
    name: z.string().regex(/^[A-Za-z0-9._-]+$/),
    repositoryTopics: z.array(z.object({name: z.string()})).nullable(),
    // Only an SSH or HTTPS address reaches `git clone`: never ext:: or a local path.
    sshUrl: z.string().refine((url) => parseGitUrl(url) !== null, 'not a git URL'),
  }),
)

async function listRepos(owner: string): Promise<z.infer<typeof GhRepos>> {
  let raw: string
  try {
    raw = await runAsync('gh', [
      'repo',
      'list',
      owner,
      '--json',
      'name,sshUrl,repositoryTopics,isArchived,isFork',
      '--limit',
      '1000',
    ])
  } catch (error) {
    const detail = error instanceof ExecError ? [error.message] : []
    throw new CoreError('COMMAND_FAILED', `Could not list the repositories of ${owner}`, detail)
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new CoreError('COMMAND_FAILED', `gh answered with something other than JSON for ${owner}`)
  }

  const parsed = GhRepos.safeParse(json)
  if (!parsed.success) {
    throw new CoreError(
      'COMMAND_FAILED',
      `gh listed repositories of ${owner} in an unexpected shape`,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    )
  }

  return parsed.data
}

/** The repositories of `owner` the filter matches, and where they would land. */
export async function planOrgClone(owner: string, filter: OrgCloneFilter = {}): Promise<OrgClonePlan> {
  const config = requireConfig()
  if (!LOGIN.test(owner)) throw new CoreError('INVALID_INPUT', `Not a GitHub organisation or user: ${owner}`)

  const orgName = filter.org || owner
  const org = config.organizations.find((o) => o.name.toLowerCase() === orgName.toLowerCase()) ?? null
  const orgDir = safeOrgFolder(config.paths.githubRoot, org?.folderName ?? orgName)
  const wanted = new Set((filter.topics ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))

  const repos: OrgRepo[] = []
  for (const repo of await listRepos(owner)) {
    const topics = (repo.repositoryTopics ?? []).map((t) => t.name)
    if (repo.isArchived && !filter.includeArchived) continue
    if (repo.isFork && !filter.includeForks) continue
    if (wanted.size > 0 && !topics.some((t) => wanted.has(t.toLowerCase()))) continue

    const repoPath = repoPathIn(orgDir, repo.name)
    repos.push({
      archived: repo.isArchived,
      fork: repo.isFork,
      local: fs.existsSync(repoPath),
      name: repo.name,
      repoPath,
      sshUrl: repo.sshUrl,
      topics,
    })
  }

  repos.sort((a, b) => a.name.localeCompare(b.name))
  return {org, orgName, organizations: config.organizations, owner, repos}
}

export type OrgCloneEvent =
  | CloneEvent
  | {index: number; name: string; total: number; type: 'repo'}
  | {message: string; name: string; type: 'repo-failed'}
  | {name: string; repoPath: string; type: 'repo-local'}
  | {type: 'topics'}

export interface OrgCloneOptions extends OrgCloneFilter {
  /** Connect git to the terminal, as for a single clone. */
  interactive?: boolean
  /** The names to clone, out of those the filter matches; omitted means all of them. */
  repos?: string[]
  /** Required when the plan found no org for the owner; applies to the whole batch. */
  target?: CloneTarget
}

export interface OrgCloneResult {
  cloned: string[]
  createdOrg: boolean
  failed: Array<{message: string; name: string}>
  /** Already in the org folder, so left as they were. */
  local: string[]
  org: null | Organization
  sync: SyncResult
  topics: TopicsResult
}

/**
 * Clone the matching repositories one after another. Syncs once before the
 * first, so a new org's includeIf is in place (#1); a failed repository is
 * reported and the rest still cloned; the topic symlinks follow at the end.
 */
export async function cloneOrg(
  owner: string,
  options: OrgCloneOptions = {},
  onEvent: OnEvent<OrgCloneEvent> = ignoreEvents,
): Promise<OrgCloneResult> {
  const plan = await planOrgClone(owner, options)
  const selected = options.repos ? pick(plan.repos, options.repos) : plan.repos

  const config = requireConfig()
  const resolved = await resolveTarget(plan, options.target, onEvent)
  const orgDir = safeOrgFolder(config.paths.githubRoot, resolved.folder)
  fs.mkdirSync(orgDir, {recursive: true})
  const sync = await runSync()

  const cloned: string[] = []
  const failed: OrgCloneResult['failed'] = []
  const local: string[] = []
  for (const [i, repo] of selected.entries()) {
    onEvent({index: i + 1, name: repo.name, total: selected.length, type: 'repo'})
    const repoPath = repoPathIn(orgDir, repo.name)
    if (fs.existsSync(repoPath)) {
      local.push(repo.name)
      onEvent({name: repo.name, repoPath, type: 'repo-local'})
      continue
    }

    try {
      // biome-ignore lint/performance/noAwaitInLoops: one clone at a time, so a terminal git owns the screen and progress arrives in order
      await gitClone(repo.sshUrl, repoPath, options.interactive ?? false, onEvent)
      cloned.push(repo.name)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failed.push({message, name: repo.name})
      onEvent({message, name: repo.name, type: 'repo-failed'})
    }
  }

  onEvent({type: 'topics'})
  const topics = await runTopicsSync()
  return {cloned, createdOrg: resolved.createdOrg, failed, local, org: resolved.org, sync, topics}
}

function pick(repos: OrgRepo[], names: string[]): OrgRepo[] {
  const byName = new Map(repos.map((r) => [r.name, r]))
  const unknown = names.filter((n) => !byName.has(n))
  if (unknown.length > 0) {
    throw new CoreError('INVALID_INPUT', 'Not among the matching repositories', unknown)
  }

  return names.map((n) => byName.get(n) as OrgRepo)
}
