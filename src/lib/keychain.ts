import {execSync} from 'node:child_process'

const KEYCHAIN_ACCOUNT = 'dotsloth'

export interface KeychainSecret {
  name: string
  value: string
}

/**
 * Add or update a secret in the macOS Keychain
 */
export function addSecret(name: string, value: string): void {
  // -U flag updates if exists, creates if not
  execSync(`security add-generic-password -a "${KEYCHAIN_ACCOUNT}" -s "${name}" -w "${value}" -U`, {
    stdio: 'pipe',
  })
}

/**
 * Get a secret value from the macOS Keychain
 */
export function getSecret(name: string): null | string {
  try {
    const result = execSync(`security find-generic-password -a "${KEYCHAIN_ACCOUNT}" -s "${name}" -w`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return result.trim()
  } catch {
    return null
  }
}

/**
 * Delete a secret from the macOS Keychain
 */
export function deleteSecret(name: string): boolean {
  try {
    execSync(`security delete-generic-password -a "${KEYCHAIN_ACCOUNT}" -s "${name}"`, {
      stdio: 'pipe',
    })
    return true
  } catch {
    return false
  }
}

/**
 * List all secret names stored by dotsloth in the Keychain
 */
export function listSecretNames(): string[] {
  try {
    // Use security dump-keychain and parse for dotsloth entries
    const result = execSync('security dump-keychain 2>/dev/null', {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large keychains
    })

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
  } catch {
    return []
  }
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
  execSync(`ssh-add --apple-use-keychain "${keyPath}"`, {
    stdio: 'inherit',
  })
}

/**
 * List SSH keys in agent
 */
export function listSshKeys(): string[] {
  try {
    const result = execSync('ssh-add -l', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return result
      .split('\n')
      .filter(Boolean)
      .map((line) => line.trim())
  } catch {
    return []
  }
}
