import * as fs from 'node:fs'
import * as path from 'node:path'

import type {DevSlothConfig, Organization} from '../types/index.js'

import {getOrgGitconfigPath, PATHS} from './paths.js'

/**
 * Generate the main ~/.gitconfig content
 */
export function generateMainGitconfig(config: DevSlothConfig, userName: string): string {
  const lines: string[] = []

  // User section
  lines.push('[user]', `    name = ${userName}`)
  if (config.sshSigning.enabled) {
    lines.push(`    signingkey = ${config.sshSigning.defaultKeyPath}.pub`)
  }

  lines.push('', '[core]', '    autocrlf = input', '', '[init]', '    defaultBranch = main', '', '[pull]', '    rebase = true', '')

  // SSH signing configuration
  if (config.sshSigning.enabled) {
    lines.push('[gpg]', '    format = ssh', '', '[gpg "ssh"]', `    allowedSignersFile = ${PATHS.icloudAllowedSigners}`, '', '[commit]', '    gpgsign = true', '', '[tag]', '    gpgsign = true', '')
  }

  // Credential helper
  lines.push('[credential]', '    helper = osxkeychain', '')

  // Organization includes
  if (config.organizations.length > 0) {
    lines.push('# Organization-specific includes (auto-detected by path)')
    for (const org of config.organizations) {
      const orgPath = path.join(config.paths.githubRoot, org.folderName)
      const gitconfigPath = getOrgGitconfigPath(org.name)
      lines.push(`[includeIf "gitdir:${orgPath}/"]`, `    path = ${gitconfigPath}`, '')
    }
  }

  return lines.join('\n')
}

/**
 * Generate organization-specific gitconfig
 */
export function generateOrgGitconfig(org: Organization): string {
  const lines: string[] = []

  lines.push('[user]', `    name = ${org.gitUsername}`, `    email = ${org.gitEmail}`)

  return lines.join('\n')
}

/**
 * Write organization gitconfig to iCloud
 */
export function writeOrgGitconfig(org: Organization): string {
  const content = generateOrgGitconfig(org)
  const configPath = getOrgGitconfigPath(org.name)

  fs.mkdirSync(path.dirname(configPath), {recursive: true})
  fs.writeFileSync(configPath, content, 'utf-8')

  return configPath
}

/**
 * Delete organization gitconfig
 */
export function deleteOrgGitconfig(orgName: string): boolean {
  const configPath = getOrgGitconfigPath(orgName)
  try {
    fs.unlinkSync(configPath)
    return true
  } catch {
    return false
  }
}

/**
 * Generate allowed_signers file content
 */
export function generateAllowedSigners(config: DevSlothConfig, publicKey: string): string {
  const lines: string[] = []

  // Add all organization emails with the same key
  const emails = new Set<string>()
  for (const org of config.organizations) {
    emails.add(org.gitEmail)
  }

  for (const email of emails) {
    lines.push(`${email} ${publicKey}`)
  }

  return lines.join('\n')
}

/**
 * Write allowed_signers file
 */
export function writeAllowedSigners(config: DevSlothConfig, publicKey: string): void {
  const content = generateAllowedSigners(config, publicKey)
  fs.writeFileSync(PATHS.icloudAllowedSigners, content, 'utf-8')
}

/**
 * Read public key from file
 */
export function readPublicKey(keyPath: string): null | string {
  try {
    return fs.readFileSync(keyPath, 'utf8').trim()
  } catch {
    return null
  }
}

/**
 * Parse a git remote URL to extract org and repo
 */
export function parseGitUrl(url: string): null | {host: string; org: string; repo: string} {
  // SSH format: git@github.com:ExRam/repo.git
  const sshMatch = url.match(/git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/)
  if (sshMatch) {
    return {
      host: sshMatch[1],
      org: sshMatch[2],
      repo: sshMatch[3],
    }
  }

  // HTTPS format: https://github.com/ExRam/repo.git
  const httpsMatch = url.match(/https?:\/\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/)
  if (httpsMatch) {
    return {
      host: httpsMatch[1],
      org: httpsMatch[2],
      repo: httpsMatch[3],
    }
  }

  return null
}

/**
 * Create organization directory if it doesn't exist
 */
export function ensureOrgDirectory(orgName: string, githubRoot: string): string {
  const orgPath = path.join(githubRoot, orgName)
  fs.mkdirSync(orgPath, {recursive: true})
  return orgPath
}
