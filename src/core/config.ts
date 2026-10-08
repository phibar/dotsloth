import {ConfigError, saveConfig} from '../lib/config.js'
import type {DevSlothConfig} from '../types/index.js'
import {CoreError, requireConfig} from './errors.js'

export {requireConfig as getConfig} from './errors.js'

/**
 * Replace the whole config with untrusted input (the web config editor).
 * Validates before anything is written; an invalid input leaves the file as it was.
 */
export function replaceConfig(input: unknown): DevSlothConfig {
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
