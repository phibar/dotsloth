/*
 * Purpose: Let an organization's jobs run on this Mac — the self-hosted
 * runners this machine installed for it, added, listed, started, stopped,
 * read and removed the same way from the CLI and the web UI (#104).
 * Intention: uses getOrg from core/orgs for the organization and
 * core/runner-folders for where its runners live and their names;
 * lib/runner/github for GitHub's view and tokens, lib/runner/package for the
 * runner application, lib/runner/registration for `config.sh` and
 * lib/runner/service for launchd. The runner folder and its LaunchAgent are
 * the only record — config.json stays as it is. Speaks to commands/runner
 * and the server's routes.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import {
  accountType,
  type GithubRunner,
  listGithubRunners,
  registrationToken,
  removeToken,
} from '../lib/runner/github.js'
import {installPackage, latestRelease} from '../lib/runner/package.js'
import {isRegistered, register, unregister} from '../lib/runner/registration.js'
import {
  isInstalled,
  isLoaded,
  joinDesktopSession,
  logPath,
  serviceName,
  svc,
  tailServiceLog,
} from '../lib/runner/service.js'
import {CoreError, requireConfig} from './errors.js'
import type {OnEvent, StepEvent} from './events.js'
import {ignoreEvents} from './events.js'
import {getOrg, type OrgInfo} from './orgs.js'
import {defaultRunnerName, localNames, NAME_PATTERN, type RunnerRef, resolve, runnersDir} from './runner-folders.js'

export const DEFAULT_LOG_LINES = 200

const LABEL_PATTERN = /^[\w.-]+$/

export interface RunnerInfo {
  /** GitHub's view, or null when it was not asked or could not be reached. */
  github: GithubRunner | null
  logPath: null | string
  name: string
  org: string
  path: string
  /** `config.sh` registered it with GitHub. */
  registered: boolean
  /** Loaded in launchd. */
  running: boolean
  serviceInstalled: boolean
  serviceName: null | string
}

/** Failures of the tools below core reach the caller as a CoreError, which the API maps to a status. */
function failed(error: unknown): CoreError {
  if (error instanceof CoreError) return error
  return new CoreError('COMMAND_FAILED', (error as Error).message)
}

function describe(org: OrgInfo, dir: string, github: GithubRunner | null): RunnerInfo {
  const name = serviceName(dir)
  return {
    github,
    logPath: name ? logPath(name) : null,
    name: path.basename(dir),
    org: org.name,
    path: dir,
    registered: isRegistered(dir),
    running: name ? isLoaded(name) : false,
    serviceInstalled: isInstalled(dir),
    serviceName: name,
  }
}

export interface ListRunnersResult {
  runners: RunnerInfo[]
  /** One per organization whose GitHub state could not be read. */
  warnings: string[]
}

/** The runners this Mac installed, per organization, with GitHub's view unless offline. */
export async function listRunners({
  offline = false,
  org,
}: {
  offline?: boolean
  org?: string
} = {}): Promise<ListRunnersResult> {
  const config = requireConfig()
  const orgs = org ? [getOrg(org, config)] : config.organizations.map((o) => getOrg(o.name, config))
  const runners: RunnerInfo[] = []
  const warnings: string[] = []

  for (const info of orgs) {
    const root = runnersDir(config, info)
    const names = localNames(root)
    if (names.length === 0) continue

    let github: GithubRunner[] = []
    if (!offline) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one org at a time to avoid bursting the gh API
        github = await listGithubRunners(info.name)
      } catch (error) {
        warnings.push(`Could not read the runners of '${info.name}' from GitHub: ${(error as Error).message}`)
      }
    }

    for (const name of names) {
      runners.push(describe(info, path.join(root, name), github.find((r) => r.name === name) ?? null))
    }
  }

  return {runners, warnings}
}

export interface AddRunnerInput {
  labels?: string[]
  name?: string
  org: string
}

/**
 * Download the latest runner, register it with the organization and start it
 * as a LaunchAgent. Until registration succeeds, a failure removes the folder
 * this call created; after it, the folder stays for `removeRunner`.
 */
export async function addRunner(
  input: AddRunnerInput,
  onEvent: OnEvent<StepEvent> = ignoreEvents,
): Promise<RunnerInfo> {
  const config = requireConfig()
  const org = getOrg(input.org, config)
  const root = runnersDir(config, org)
  const name = input.name ?? defaultRunnerName(localNames(root))
  const labels = input.labels ?? []

  if (!NAME_PATTERN.test(name)) {
    throw new CoreError('INVALID_INPUT', `'${name}' is not a valid runner name (letters, digits, '.', '_', '-')`)
  }

  const badLabel = labels.find((label) => !LABEL_PATTERN.test(label))
  if (badLabel !== undefined) throw new CoreError('INVALID_INPUT', `'${badLabel}' is not a valid label`)

  const dir = path.join(root, name)
  if (fs.existsSync(dir)) throw new CoreError('CONFLICT', `Runner '${name}' of '${org.name}' already exists at ${dir}`)

  try {
    if ((await accountType(org.name)) !== 'Organization') {
      throw new CoreError(
        'INVALID_INPUT',
        `'${org.name}' is a personal account on GitHub; runners are managed for organizations only`,
      )
    }

    const release = await latestRelease()
    onEvent({label: `Latest runner: ${release.version}`, status: 'ok', type: 'step'})

    fs.mkdirSync(dir, {recursive: true})
    try {
      await installPackage(release, dir)
      onEvent({detail: dir, label: 'Downloaded and verified (SHA-256)', status: 'ok', type: 'step'})

      const token = await registrationToken(org.name)
      await register({dir, labels, name, onLine: (line) => onEvent({label: line, type: 'info'}), org: org.name, token})
      onEvent({label: `Registered '${name}' with ${org.name}`, status: 'ok', type: 'step'})
    } catch (error) {
      fs.rmSync(dir, {force: true, recursive: true})
      throw error
    }

    svc(dir, 'install')
    // GitHub matches labels ignoring case.
    if (labels.some((label) => label.toLowerCase() === 'desktop')) {
      joinDesktopSession(dir)
      onEvent({label: "Runs in the desktop's own session", status: 'ok', type: 'step'})
    }

    svc(dir, 'start')
    onEvent({label: 'Started as a LaunchAgent', status: 'ok', type: 'step'})
    return describe(org, dir, null)
  } catch (error) {
    throw failed(error)
  }
}

/** Apply `change` to a runner's service and report the runner as it then is. */
async function changeService(ref: RunnerRef, change: (dir: string, name: null | string) => void): Promise<RunnerInfo> {
  const {dir, org} = resolve(ref)
  try {
    change(dir, serviceName(dir))
  } catch (error) {
    throw failed(error)
  }

  return describe(org, dir, null)
}

/** Load the runner's LaunchAgent; a runner already loaded stays as it is. */
export function startRunner(ref: RunnerRef): Promise<RunnerInfo> {
  return changeService(ref, (dir, name) => {
    if (!name || !isInstalled(dir)) throw new CoreError('CONFLICT', `Runner at ${dir} has no service installed`)
    if (!isLoaded(name)) svc(dir, 'start')
  })
}

/** Unload the runner's LaunchAgent; a runner not loaded stays as it is. */
export function stopRunner(ref: RunnerRef): Promise<RunnerInfo> {
  return changeService(ref, (dir, name) => {
    if (name && isLoaded(name)) svc(dir, 'stop')
  })
}

export interface RunnerLogs {
  lines: string[]
  logPath: null | string
}

export function runnerLogs(ref: RunnerRef & {lines?: number}): RunnerLogs {
  const lines = ref.lines ?? DEFAULT_LOG_LINES
  if (!Number.isInteger(lines) || lines < 1) throw new CoreError('INVALID_INPUT', 'lines must be a positive integer')
  const {dir} = resolve(ref)
  const name = serviceName(dir)
  return {lines: name ? tailServiceLog(name, lines) : [], logPath: name ? logPath(name) : null}
}

export interface RemoveRunnerResult extends Pick<RunnerInfo, 'name' | 'org' | 'path'> {
  /** False when `force` removed it locally although GitHub refused. */
  deregistered: boolean
}

/**
 * Remove the service, deregister the runner and delete its folder. Where
 * GitHub refuses (it no longer knows the runner), `force` still removes the
 * local service and folder.
 */
export async function removeRunner(
  ref: RunnerRef & {force?: boolean},
  onEvent: OnEvent<StepEvent> = ignoreEvents,
): Promise<RemoveRunnerResult> {
  const {dir, org} = resolve(ref)
  const name = path.basename(dir)

  try {
    if (isInstalled(dir)) {
      svc(dir, 'uninstall')
      onEvent({label: 'Service removed', status: 'ok', type: 'step'})
    }

    let deregistered = false
    if (isRegistered(dir)) {
      try {
        const token = await removeToken(org.name)
        await unregister(dir, token, (line) => onEvent({label: line, type: 'info'}))
        deregistered = true
        onEvent({label: `Deregistered '${name}' from ${org.name}`, status: 'ok', type: 'step'})
      } catch (error) {
        if (!ref.force) throw error
        onEvent({
          detail: (error as Error).message,
          label: 'GitHub refused; removing locally',
          status: 'warning',
          type: 'step',
        })
      }
    }

    fs.rmSync(dir, {force: true, recursive: true})
    onEvent({detail: dir, label: 'Folder deleted', status: 'ok', type: 'step'})
    return {deregistered, name, org: org.name, path: dir}
  } catch (error) {
    throw failed(error)
  }
}
