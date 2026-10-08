import {
  deleteSecret,
  getSecret,
  isValidSecretName,
  listSecretNames as listNames,
  addSecret as storeSecret,
} from '../lib/keychain.js'
import {CoreError} from './errors.js'

/**
 * Secrets live in the macOS Keychain. Core hands out names freely but values
 * only one at a time, on explicit request ({@link revealSecret}). Exporting
 * every value at once (`secret export` / `secret load`) is deliberately not
 * here: it stays a CLI-only feature, so no API built on core can offer it.
 */

/** Secret names are stored upper-case, like the environment variables they become. */
export function normalizeSecretName(name: string): string {
  const normalized = name.trim().toUpperCase()
  if (!isValidSecretName(normalized)) {
    throw new CoreError('INVALID_INPUT', `Invalid secret name '${name}'`, [
      'Use letters, digits and underscores, not starting with a digit',
    ])
  }

  return normalized
}

export function listSecretNames(): string[] {
  return listNames()
}

export function secretExists(name: string): boolean {
  return getSecret(normalizeSecretName(name)) !== null
}

/** Store a secret. Refuses to replace an existing one unless `overwrite` is set. */
export function setSecret(name: string, value: string, {overwrite = false} = {}): {created: boolean; name: string} {
  const normalized = normalizeSecretName(name)
  if (!value) throw new CoreError('INVALID_INPUT', 'Secret value cannot be empty')

  const exists = getSecret(normalized) !== null
  if (exists && !overwrite) throw new CoreError('CONFLICT', `Secret '${normalized}' already exists`)

  try {
    storeSecret(normalized, value)
  } catch (error) {
    throw new CoreError('CONFLICT', `Failed to store secret '${normalized}'`, [(error as Error).message])
  }

  return {created: !exists, name: normalized}
}

export function removeSecret(name: string): {name: string} {
  const normalized = normalizeSecretName(name)
  if (getSecret(normalized) === null) throw new CoreError('NOT_FOUND', `Secret '${normalized}' not found`)
  if (!deleteSecret(normalized)) throw new CoreError('CONFLICT', `Failed to remove secret '${normalized}'`)
  return {name: normalized}
}

/** The value of a single secret. */
export function revealSecret(name: string): string {
  const normalized = normalizeSecretName(name)
  const value = getSecret(normalized)
  if (value === null) throw new CoreError('NOT_FOUND', `Secret '${normalized}' not found`)
  return value
}
