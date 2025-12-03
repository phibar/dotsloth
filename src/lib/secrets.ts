/**
 * Patterns for detecting secrets in shell profiles
 */
const SECRET_PATTERNS = [
  /^export\s+AWS_ACCESS_KEY_ID=/,
  /^export\s+AWS_SECRET_ACCESS_KEY=/,
  /^export\s+.*_API_KEY=/i,
  /^export\s+.*_API_TOKEN=/i,
  /^export\s+.*_SECRET=/i,
  /^export\s+.*_TOKEN=/i,
  /^export\s+OPENAI_/,
  /^export\s+ANTHROPIC_/,
  /^export\s+CLOUDFLARE_/,
  /^export\s+.*_ACCESS_KEY=/i,
  /^export\s+.*_SECRET_KEY=/i,
  /^export\s+.*CREDENTIALS/i,
]

export interface ExtractedSecrets {
  cleanContent: string
  secrets: Array<{name: string; value: string}>
}

/**
 * Check if a line contains a secret
 */
function isSecretLine(line: string): boolean {
  const trimmed = line.trim()
  return SECRET_PATTERNS.some((pattern) => pattern.test(trimmed))
}

/**
 * Parse an export line to extract name and value
 */
function parseExportLine(line: string): null | {name: string; value: string} {
  // Match: export NAME=value or export NAME="value" or export NAME='value'
  const match = line.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  if (!match) return null

  const name = match[1]
  let value = match[2].trim()

  // Remove surrounding quotes if present
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }

  return {name, value}
}

/**
 * Extract secrets from zprofile content
 */
export function extractSecrets(content: string): ExtractedSecrets {
  const lines = content.split('\n')
  const cleanLines: string[] = []
  const secrets: Array<{name: string; value: string}> = []

  for (const line of lines) {
    if (isSecretLine(line)) {
      const parsed = parseExportLine(line.trim())
      if (parsed) {
        secrets.push(parsed)
      }
    } else {
      cleanLines.push(line)
    }
  }

  // Add the dotsloth secret load line if we found secrets
  if (secrets.length > 0) {
    // Find a good place to add the load command (near the end, before completions)
    let insertIndex = cleanLines.length
    for (let i = cleanLines.length - 1; i >= 0; i--) {
      if (cleanLines[i].includes('compinit') || cleanLines[i].includes('completion')) {
        insertIndex = i
        break
      }
    }

    // Check if the load command already exists
    const hasLoadCommand = cleanLines.some((line) => line.includes('dotsloth secret load'))

    if (!hasLoadCommand) {
      cleanLines.splice(insertIndex, 0, '', '# Load secrets from iCloud Keychain', 'eval "$(dotsloth secret load)"')
    }
  }

  return {
    cleanContent: cleanLines.join('\n'),
    secrets,
  }
}

/**
 * Generate shell export statements for secrets
 */
export function generateExportStatements(secrets: Array<{name: string; value: string}>): string {
  return secrets.map((s) => `export ${s.name}="${s.value}"`).join('\n')
}

/**
 * Check if content appears to have secrets
 */
export function hasSecrets(content: string): boolean {
  const lines = content.split('\n')
  return lines.some((line) => isSecretLine(line))
}

/**
 * Count secrets in content
 */
export function countSecrets(content: string): number {
  const lines = content.split('\n')
  return lines.filter((line) => isSecretLine(line)).length
}
