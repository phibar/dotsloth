import * as fs from 'node:fs'
import * as path from 'node:path'
import {ensureIcloudStructure, getDefaultConfig, readConfig, saveConfig} from '../lib/config.js'
import {deleteOrgGitconfig, writeOrgGitconfig} from '../lib/git.js'
import type {SyncResult} from '../lib/sync.js'
import {runSync} from '../lib/sync.js'
import type {DevSlothConfig, Organization} from '../types/index.js'
import {OrganizationSchema} from '../types/index.js'
import {CoreError, requireConfig} from './errors.js'

export interface OrgInfo extends Organization {
  /** Whether the org folder exists yet. */
  exists: boolean
  /** The org folder under the configured GitHub root. */
  path: string
  repoCount: number
}

export interface OrgInput {
  /** Folder under the GitHub root; defaults to the name. */
  folderName?: string
  gitEmail: string
  gitUsername: string
  name: string
  signingKey?: string
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export function orgPath(config: DevSlothConfig, org: Pick<Organization, 'folderName'>): string {
  return path.join(config.paths.githubRoot, org.folderName)
}

/** Repositories are the non-hidden directories in the org folder. */
export function countRepos(dir: string): number {
  try {
    return fs.readdirSync(dir, {withFileTypes: true}).filter((e) => e.isDirectory() && !e.name.startsWith('.')).length
  } catch {
    return 0
  }
}

function toInfo(config: DevSlothConfig, org: Organization): OrgInfo {
  const dir = orgPath(config, org)
  const exists = fs.existsSync(dir)
  return {...org, exists, path: dir, repoCount: exists ? countRepos(dir) : 0}
}

export function listOrgs(config: DevSlothConfig = requireConfig()): OrgInfo[] {
  return config.organizations.map((org) => toInfo(config, org))
}

/** The org with this name (case-insensitive), or null. Works before init, too. */
export function findOrg(name: string): null | Organization {
  return readConfig()?.organizations.find((o) => sameName(o.name, name)) ?? null
}

export function getOrg(name: string, config: DevSlothConfig = requireConfig()): OrgInfo {
  const org = config.organizations.find((o) => sameName(o.name, name))
  if (!org) throw new CoreError('ORG_NOT_FOUND', `Organization '${name}' not found`)
  return toInfo(config, org)
}

function validateOrg(input: Organization): Organization {
  const result = OrganizationSchema.safeParse(input)
  if (!result.success) {
    throw new CoreError(
      'INVALID_INPUT',
      'Invalid organization',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    )
  }

  if (!result.data.name.trim() || !result.data.gitUsername.trim()) {
    throw new CoreError('INVALID_INPUT', 'Invalid organization', ['name and gitUsername are required'])
  }

  return result.data
}

/**
 * The org folder, guaranteed to be a direct child of the GitHub root. A
 * folderName of "", "." or "../x" would otherwise point a recursive delete at
 * the GitHub root itself or outside it.
 */
function safeOrgPath(config: DevSlothConfig, org: Organization): string {
  const root = path.resolve(config.paths.githubRoot)
  const dir = path.resolve(root, org.folderName)
  if (path.dirname(dir) !== root || path.basename(dir) !== org.folderName) {
    throw new CoreError('UNSAFE_PATH', `Refusing to use '${org.folderName}' as an org folder under ${root}`)
  }

  return dir
}

export interface AddOrgResult {
  /** False when an existing org was updated. */
  created: boolean
  /** True when the org folder did not exist and was created. */
  createdFolder: boolean
  gitconfigPath: string
  org: OrgInfo
  sync: SyncResult
}

/**
 * Add an organization, or update it when `overwrite` is set. Writes its
 * gitconfig, creates its folder and syncs, so the identity applies at once.
 */
export async function addOrg(input: OrgInput, {overwrite = false} = {}): Promise<AddOrgResult> {
  const org = validateOrg({
    folderName: input.folderName ?? input.name,
    gitEmail: input.gitEmail,
    gitUsername: input.gitUsername,
    name: input.name,
    ...(input.signingKey ? {signingKey: input.signingKey} : {}),
  })

  ensureIcloudStructure()
  const config = readConfig() ?? getDefaultConfig()
  const dir = safeOrgPath(config, org)

  const index = config.organizations.findIndex((o) => sameName(o.name, org.name))
  if (index !== -1 && !overwrite) {
    throw new CoreError('ORG_EXISTS', `Organization '${org.name}' already exists`)
  }

  if (index === -1) config.organizations.push(org)
  else config.organizations[index] = org
  saveConfig(config)

  const gitconfigPath = writeOrgGitconfig(org)
  const createdFolder = !fs.existsSync(dir)
  if (createdFolder) fs.mkdirSync(dir, {recursive: true})

  return {created: index === -1, createdFolder, gitconfigPath, org: toInfo(config, org), sync: await runSync()}
}

export interface UpdateOrgResult {
  after: Organization
  before: Organization
  /** False when nothing differed; then nothing was written or synced. */
  changed: boolean
  sync?: SyncResult
}

export async function updateOrg(
  name: string,
  changes: Partial<Pick<Organization, 'gitEmail' | 'gitUsername' | 'signingKey'>>,
): Promise<UpdateOrgResult> {
  const config = requireConfig()
  const index = config.organizations.findIndex((o) => sameName(o.name, name))
  if (index === -1) throw new CoreError('ORG_NOT_FOUND', `Organization '${name}' not found`)

  const before = config.organizations[index]
  const after = validateOrg({...before, ...changes})
  if (JSON.stringify(after) === JSON.stringify(before)) {
    return {after, before, changed: false}
  }

  config.organizations[index] = after
  saveConfig(config)
  return {after, before, changed: true, sync: await runSync()}
}

export interface RemoveOrgResult {
  deletedFolder: boolean
  org: OrgInfo
  sync: SyncResult
}

/**
 * Remove an organization from the config and delete its gitconfig. With
 * `deleteRepos`, also deletes its folder and every repository in it - callers
 * must have confirmed that explicitly.
 */
export async function removeOrg(name: string, {deleteRepos = false} = {}): Promise<RemoveOrgResult> {
  const config = requireConfig()
  const org = getOrg(name, config)

  // Check before changing anything, so an unsafe folder aborts the whole removal.
  const dir = deleteRepos ? safeOrgPath(config, org) : org.path

  deleteOrgGitconfig(org.name)
  const deletedFolder = deleteRepos && fs.existsSync(dir)
  if (deletedFolder) fs.rmSync(dir, {force: true, recursive: true})

  config.organizations = config.organizations.filter((o) => !sameName(o.name, org.name))
  saveConfig(config)

  return {deletedFolder, org, sync: await runSync()}
}

/** Which org a directory belongs to, judged by its first folder under the GitHub root. */
export function resolveOrgForPath(
  config: DevSlothConfig,
  dir: string,
): null | {folder: string; org: null | Organization} {
  const root = path.resolve(config.paths.githubRoot)
  const relative = path.relative(root, path.resolve(dir))
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null

  const folder = relative.split(path.sep)[0]
  const org = config.organizations.find((o) => sameName(o.folderName, folder)) ?? null
  return {folder, org}
}
