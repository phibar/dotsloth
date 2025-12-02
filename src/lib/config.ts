import * as fs from 'node:fs'
import * as path from 'node:path'

import type {DevSlothConfig, Organization} from '../types/index.js'
import {DevSlothConfigSchema} from '../types/index.js'
import {getOrgGitconfigPath, PATHS} from './paths.js'

/**
 * Generate and write org gitconfig file (keeps gitconfig in sync with config.json)
 */
function syncOrgGitconfig(org: Organization): void {
  const content = `[user]
    name = ${org.gitUsername}
    email = ${org.gitEmail}
`
  const configPath = getOrgGitconfigPath(org.name)
  fs.mkdirSync(path.dirname(configPath), {recursive: true})
  fs.writeFileSync(configPath, content, 'utf-8')
}

/**
 * Sync all org gitconfigs from config.json (single source of truth)
 */
export function syncAllOrgGitconfigs(config: DevSlothConfig): void {
  for (const org of config.organizations) {
    syncOrgGitconfig(org)
  }
}

/**
 * Get default config for new installations
 */
export function getDefaultConfig(): DevSlothConfig {
  return {
    version: 1,
    organizations: [],
    sshSigning: {
      enabled: true,
      defaultKeyPath: PATHS.defaultSshKey,
    },
    paths: {
      githubRoot: PATHS.githubRoot,
    },
    syncedFiles: [
      {
        source: path.join(PATHS.icloudDotfiles, 'zprofile'),
        target: PATHS.zprofile,
      },
      {
        source: path.join(PATHS.icloudDotfiles, 'gitconfig'),
        target: PATHS.gitconfig,
      },
      {
        source: path.join(PATHS.icloudDotfiles, 'ssh_config'),
        target: PATHS.sshConfig,
      },
    ],
  }
}

/**
 * Check if iCloud config exists
 */
export function configExists(): boolean {
  return fs.existsSync(PATHS.icloudConfig)
}

/**
 * Load config from iCloud and sync org gitconfigs
 */
export function loadConfig(autoSync = true): DevSlothConfig | null {
  if (!configExists()) {
    return null
  }

  try {
    const content = fs.readFileSync(PATHS.icloudConfig, 'utf-8')
    const data = JSON.parse(content)
    const config = DevSlothConfigSchema.parse(data)

    // Auto-sync org gitconfigs from config.json (single source of truth)
    if (autoSync && config.organizations.length > 0) {
      syncAllOrgGitconfigs(config)
    }

    return config
  } catch (error) {
    console.error('Failed to load config:', error)
    return null
  }
}

/**
 * Save config to iCloud
 */
export function saveConfig(config: DevSlothConfig): void {
  // Ensure directories exist
  fs.mkdirSync(path.dirname(PATHS.icloudConfig), {recursive: true})

  const content = JSON.stringify(config, null, 2)
  fs.writeFileSync(PATHS.icloudConfig, content, 'utf-8')
}

/**
 * Add organization to config
 */
export function addOrganization(org: Organization): DevSlothConfig {
  let config = loadConfig()
  if (!config) {
    config = getDefaultConfig()
  }

  // Check if org already exists
  const existingIndex = config.organizations.findIndex(
    (o) => o.name.toLowerCase() === org.name.toLowerCase(),
  )

  if (existingIndex >= 0) {
    config.organizations[existingIndex] = org
  } else {
    config.organizations.push(org)
  }

  saveConfig(config)
  return config
}

/**
 * Remove organization from config
 */
export function removeOrganization(orgName: string): DevSlothConfig | null {
  const config = loadConfig()
  if (!config) {
    return null
  }

  config.organizations = config.organizations.filter(
    (o) => o.name.toLowerCase() !== orgName.toLowerCase(),
  )

  saveConfig(config)
  return config
}

/**
 * Get organization by name
 */
export function getOrganization(orgName: string): Organization | null {
  const config = loadConfig()
  if (!config) {
    return null
  }

  return config.organizations.find((o) => o.name.toLowerCase() === orgName.toLowerCase()) || null
}

/**
 * Find organization by folder path
 */
export function findOrgByPath(repoPath: string): Organization | null {
  const config = loadConfig()
  if (!config) {
    return null
  }

  const normalizedPath = path.normalize(repoPath)

  for (const org of config.organizations) {
    const orgPath = path.join(PATHS.githubRoot, org.folderName)
    if (normalizedPath.startsWith(orgPath)) {
      return org
    }
  }

  return null
}

/**
 * Ensure iCloud directory structure exists
 */
export function ensureIcloudStructure(): void {
  const dirs = [PATHS.icloudDotsloth, PATHS.icloudDotfiles, PATHS.icloudOrganizations, PATHS.icloudEnvFiles]

  for (const dir of dirs) {
    fs.mkdirSync(dir, {recursive: true})
  }
}

/**
 * Check if iCloud Drive is accessible
 */
export function isIcloudAccessible(): boolean {
  return fs.existsSync(PATHS.icloudDrive)
}
