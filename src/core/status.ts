import {ConfigError, configExists, isIcloudAccessible, readConfig} from '../lib/config.js'
import {listSecretNames, listSshKeys} from '../lib/keychain.js'
import {PATHS} from '../lib/paths.js'
import {checkSymlinks} from '../lib/symlink.js'
import type {DevSlothConfig, Organization, SymlinkStatus} from '../types/index.js'
import {resolveOrgForPath} from './orgs.js'

export interface Status {
  config: {
    /** One line per problem when config.json exists but is invalid. */
    errors?: string[]
    exists: boolean
    path: string
    value: DevSlothConfig | null
  }
  /** Set when a directory was given and it lies under the GitHub root. */
  directory?: {folder: string; org: null | Organization; path: string}
  icloud: {accessible: boolean; path: string}
  secrets: {names: string[]}
  sshKeys: string[]
  symlinks: SymlinkStatus[]
}

function readConfigSafely(): {errors?: string[]; value: DevSlothConfig | null} {
  try {
    return {value: readConfig()}
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    return {errors: error.issues.length > 0 ? error.issues : [error.message], value: null}
  }
}

/**
 * Everything `dotsloth status` shows, as data. A pure read: unlike the old
 * status command it never regenerates gitconfigs.
 *
 * Secret names only - never values.
 */
export function getStatus({directory}: {directory?: string} = {}): Status {
  const icloud = {accessible: isIcloudAccessible(), path: PATHS.icloudDrive}
  const {errors, value} = icloud.accessible ? readConfigSafely() : {errors: undefined, value: null}
  const located = value && directory ? resolveOrgForPath(value, directory) : null

  return {
    config: {errors, exists: icloud.accessible && configExists(), path: PATHS.icloudConfig, value},
    directory: located && directory ? {...located, path: directory} : undefined,
    icloud,
    secrets: {names: listSecretNames()},
    sshKeys: listSshKeys(),
    symlinks: value ? checkSymlinks(value.syncedFiles) : [],
  }
}
