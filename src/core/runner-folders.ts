/*
 * Purpose: Where an organization's runners live on this Mac and what they are
 * called, so every runner operation finds the same folder by the same name.
 * Intention: uses getOrg and safeOrgFolder from core/orgs and requireConfig
 * from core/errors; a runner is the folder <org folder>/.runners/<name>/,
 * hidden so repo counts skip it. Speaks to core/runners.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import type {DevSlothConfig} from '../types/index.js'
import {CoreError, requireConfig} from './errors.js'
import {getOrg, type OrgInfo, safeOrgFolder} from './orgs.js'

export const RUNNERS_FOLDER = '.runners'

/** A runner name doubles as its folder name, so it is one plain path segment. */
export const NAME_PATTERN = /^[A-Za-z\d][\w.-]*$/

export interface RunnerRef {
  /** Optional while the organization has exactly one runner on this Mac. */
  name?: string
  org: string
}

export function runnersDir(config: DevSlothConfig, org: OrgInfo): string {
  return path.join(safeOrgFolder(config.paths.githubRoot, org.folderName), RUNNERS_FOLDER)
}

export function localNames(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, {withFileTypes: true})
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

export function resolve(ref: RunnerRef): {dir: string; org: OrgInfo} {
  const config = requireConfig()
  const org = getOrg(ref.org, config)
  const root = runnersDir(config, org)
  const names = localNames(root)

  let {name} = ref
  if (name === undefined) {
    if (names.length !== 1) {
      throw new CoreError(
        'INVALID_INPUT',
        names.length === 0
          ? `No runner of '${org.name}' on this Mac`
          : `'${org.name}' has ${names.length} runners on this Mac — name one`,
        names,
      )
    }

    name = names[0]
  }

  if (!names.includes(name)) throw new CoreError('NOT_FOUND', `No runner '${name}' of '${org.name}' on this Mac`)
  return {dir: path.join(root, name), org}
}

/** This Mac's short host name, then `-2`, `-3` … for further runners of the same organization. */
export function defaultRunnerName(existing: string[], host: string = os.hostname()): string {
  const base =
    host
      .replace(/\.local$/, '')
      .toLowerCase()
      .replaceAll(/[^\da-z.-]+/g, '-')
      .replaceAll(/^[-.]+|-+$/g, '') || 'runner'
  if (!existing.includes(base)) return base
  let n = 2
  while (existing.includes(`${base}-${n}`)) n++
  return `${base}-${n}`
}
