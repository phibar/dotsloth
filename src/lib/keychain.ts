import {run, tryRun} from './exec.js'

const KEYCHAIN_ACCOUNT = 'dotsloth'

/**
 * A secret's name becomes a shell variable (`secret load` prints
 * `export NAME=...`), so it has to be a valid identifier anyway. Enforcing it
 * here also keeps a name from ever being read as a `security` option.
 */
export const SECRET_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export function isValidSecretName(name: string): boolean {
  return SECRET_NAME_PATTERN.test(name)
}

export interface KeychainSecret {
  name: string
  value: string
}

/**
 * Add or update a secret in the macOS Keychain
 */
export function addSecret(name: string, value: string): void {
  if (!isValidSecretName(name)) {
    throw new Error(`Invalid secret name '${name}': use letters, digits and underscores, not starting with a digit`)
  }

  // -U flag updates if exists, creates if not
  run('security', ['add-generic-password', '-a', KEYCHAIN_ACCOUNT, '-s', name, '-w', value, '-U'])
}

/**
 * Get a secret value from the macOS Keychain
 */
export function getSecret(name: string): null | string {
  if (!isValidSecretName(name)) return null
  const result = tryRun('security', ['find-generic-password', '-a', KEYCHAIN_ACCOUNT, '-s', name, '-w'])
  return result === null ? null : result.trim()
}

/**
 * Delete a secret from the macOS Keychain
 */
export function deleteSecret(name: string): boolean {
  if (!isValidSecretName(name)) return false
  return tryRun('security', ['delete-generic-password', '-a', KEYCHAIN_ACCOUNT, '-s', name]) !== null
}

/**
 * List all secret names stored by dotsloth in the Keychain
 */
export function listSecretNames(): string[] {
  // Use security dump-keychain and parse for dotsloth entries
  const result = tryRun('security', ['dump-keychain'], {maxBuffer: 50 * 1024 * 1024}) // large keychains
  if (result === null) return []

  const secrets: string[] = []
  const lines = result.split('\n')

  let inDotslothEntry = false
  for (const line of lines) {
    // Check if this is a dotsloth account entry
    if (line.includes(`"acct"<blob>="${KEYCHAIN_ACCOUNT}"`)) {
      inDotslothEntry = true
    }

    // Extract service name (our secret name) from dotsloth entries
    if (inDotslothEntry && line.includes('"svce"<blob>="')) {
      const match = line.match(/"svce"<blob>="([^"]+)"/)
      if (match && match[1]) {
        secrets.push(match[1])
      }

      inDotslothEntry = false
    }
  }

  return [...new Set(secrets)].sort()
}

/**
 * Get all secrets as key-value pairs
 */
export function getAllSecrets(): KeychainSecret[] {
  const names = listSecretNames()
  const secrets: KeychainSecret[] = []

  for (const name of names) {
    const value = getSecret(name)
    if (value !== null) {
      secrets.push({name, value})
    }
  }

  return secrets
}

/**
 * Add SSH key to macOS Keychain for persistence
 */
export function addSshKeyToKeychain(keyPath: string): void {
  // `--` so a path starting with '-' can never be read as an option.
  run('ssh-add', ['--apple-use-keychain', '--', keyPath], {interactive: true})
}

/**
 * List SSH keys in agent
 */
export function listSshKeys(): string[] {
  const result = tryRun('ssh-add', ['-l'])
  if (result === null) return []
  return result
    .split('\n')
    .filter(Boolean)
    .map((line) => line.trim())
}
