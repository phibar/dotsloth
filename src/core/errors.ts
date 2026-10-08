import {ConfigError, readConfig} from '../lib/config.js'
import type {DevSlothConfig} from '../types/index.js'

/**
 * Stable reasons a core operation can fail. The CLI prints the message; the
 * web API maps the code to an HTTP status, so codes must not be renamed.
 */
export type CoreErrorCode =
  | 'COMMAND_FAILED'
  | 'CONFIG_INVALID'
  | 'CONFIG_MISSING'
  | 'CONFLICT'
  | 'ICLOUD_UNAVAILABLE'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'ORG_EXISTS'
  | 'ORG_NOT_FOUND'
  | 'UNSAFE_PATH'

export class CoreError extends Error {
  constructor(
    readonly code: CoreErrorCode,
    message: string,
    /** Extra lines, for example one per validation problem. */
    readonly details: string[] = [],
  ) {
    super(message)
    this.name = 'CoreError'
  }
}

/** The config, or a CoreError explaining why there is none to work with. */
export function requireConfig(): DevSlothConfig {
  let config: DevSlothConfig | null
  try {
    config = readConfig()
  } catch (error) {
    if (error instanceof ConfigError) {
      throw new CoreError(
        'CONFIG_INVALID',
        'config.json is invalid',
        error.issues.length > 0 ? error.issues : [error.message],
      )
    }

    throw error
  }

  if (!config) {
    throw new CoreError('CONFIG_MISSING', 'No configuration found. Run "dotsloth init" first.')
  }

  return config
}
