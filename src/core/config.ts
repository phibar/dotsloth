import {createHash} from 'node:crypto'
import * as fs from 'node:fs'

import {ConfigError, readConfig, saveConfig} from '../lib/config.js'
import {PATHS} from '../lib/paths.js'
import type {DevSlothConfig} from '../types/index.js'
import {CoreError, requireConfig} from './errors.js'

export {requireConfig as getConfig} from './errors.js'

/** The configured GitHub root; the default one before init. */
export function getGithubRoot(): string {
  try {
    return readConfig()?.paths.githubRoot ?? PATHS.githubRoot
  } catch (error) {
    if (error instanceof ConfigError) throw new CoreError('CONFIG_INVALID', 'config.json is invalid', error.issues)
    throw error
  }
}

/**
 * Identifies the config.json content, so an editor can tell whether the file
 * changed since it was loaded - iCloud may sync an edit from another Mac.
 */
export function configVersion(): null | string {
  try {
    return createHash('sha256').update(fs.readFileSync(PATHS.icloudConfig)).digest('hex').slice(0, 16)
  } catch {
    return null
  }
}

export function getConfigWithVersion(): {config: DevSlothConfig; version: string} {
  const config = requireConfig()
  return {config, version: configVersion() as string}
}

/**
 * Replace the whole config with untrusted input (the web config editor).
 * Validates before anything is written; an invalid input leaves the file as it
 * was. With `expectedVersion`, refuses to overwrite a file that changed since.
 */
export function replaceConfig(input: unknown, {expectedVersion}: {expectedVersion?: string} = {}): DevSlothConfig {
  if (expectedVersion !== undefined && configVersion() !== expectedVersion) {
    throw new CoreError('CONFLICT', 'config.json changed since it was loaded', [
      'It was edited elsewhere (another Mac, the CLI). Reload to see the current version.',
    ])
  }

  try {
    saveConfig(input as DevSlothConfig)
  } catch (error) {
    if (error instanceof ConfigError) {
      throw new CoreError('INVALID_INPUT', 'The configuration is invalid', error.issues)
    }

    throw error
  }

  return requireConfig()
}

/** Apply a change to the current config and save it. */
export function updateConfig(change: (config: DevSlothConfig) => DevSlothConfig): DevSlothConfig {
  return replaceConfig(change(structuredClone(requireConfig())))
}
