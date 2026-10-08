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
  fs.writeFileSync(configPath, content, 'utf8')
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
    organizations: [],
    paths: {
      githubRoot: PATHS.githubRoot,
    },
    sshSigning: {
      defaultKeyPath: PATHS.defaultSshKey,
      enabled: true,
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
    version: 1,
  }
}

/**
 * Check if iCloud config exists
 */
export function configExists(): boolean {
  return fs.existsSync(PATHS.icloudConfig)
}

/** config.json exists but cannot be used: not JSON, or not the expected shape. */
export class ConfigError extends Error {
  constructor(
    summary: string,
    /** One line per problem, `path: message`. */
    readonly issues: string[] = [],
  ) {
    super([summary, ...issues.map((issue) => `  - ${issue}`)].join('\n'))
    this.name = 'ConfigError'
  }
}

function validate(data: unknown): DevSlothConfig {
  const result = DevSlothConfigSchema.safeParse(data)
  if (!result.success) {
    throw new ConfigError(
      'config.json does not match the expected format',
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    )
  }

  return result.data
}

/**
 * Read and validate config.json without side effects.
 *
 * Returns null when there is no config yet. Throws {@link ConfigError} when
 * it exists but is broken - deliberately not null, which callers read as
 * "run init" and which would invite overwriting a config that only has a typo.
 */
export function readConfig(): DevSlothConfig | null {
  if (!configExists()) {
    return null
  }

  let data: unknown
  try {
    data = JSON.parse(fs.readFileSync(PATHS.icloudConfig, 'utf8'))
  } catch (error) {
    throw new ConfigError(`config.json is not valid JSON: ${(error as Error).message}`)
  }

  return validate(data)
}

/**
 * Read config and, by default, regenerate the org gitconfigs from it.
 *
 * The CLI's convenience entry point. Anything that only needs to look at the
 * config - every status view - uses {@link readConfig}, which writes nothing.
 */
export function loadConfig(autoSync = true): DevSlothConfig | null {
  const config = readConfig()

  // Auto-sync org gitconfigs from config.json (single source of truth)
  if (config && autoSync && config.organizations.length > 0) {
    syncAllOrgGitconfigs(config)
  }

  return config
}

/**
 * Validate and save config to iCloud.
 *
 * Written to a temp file and renamed into place, so a crash or a concurrent
 * reader (iCloud itself, another dotsloth process) never sees half a file.
 */
export function saveConfig(config: DevSlothConfig): void {
  const valid = validate(config)

  fs.mkdirSync(path.dirname(PATHS.icloudConfig), {recursive: true})

  const tmpPath = `${PATHS.icloudConfig}.${process.pid}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(valid, null, 2), 'utf8')
  fs.renameSync(tmpPath, PATHS.icloudConfig)
}

/**
 * Add organization to config
 */
export function addOrganization(org: Organization): DevSlothConfig {
  const config = readConfig() ?? getDefaultConfig()

  // Check if org already exists
  const existingIndex = config.organizations.findIndex((o) => o.name.toLowerCase() === org.name.toLowerCase())

  if (existingIndex === -1) {
    config.organizations.push(org)
  } else {
    config.organizations[existingIndex] = org
  }

  saveConfig(config)
  return config
}

/**
 * Remove organization from config
 */
export function removeOrganization(orgName: string): DevSlothConfig | null {
  const config = readConfig()
  if (!config) {
    return null
  }

  config.organizations = config.organizations.filter((o) => o.name.toLowerCase() !== orgName.toLowerCase())

  saveConfig(config)
  return config
}

/**
 * Get organization by name
 */
export function getOrganization(orgName: string): null | Organization {
  const config = readConfig()
  if (!config) {
    return null
  }

  return config.organizations.find((o) => o.name.toLowerCase() === orgName.toLowerCase()) || null
}

/**
 * Find organization by folder path
 */
export function findOrgByPath(repoPath: string): null | Organization {
  const config = readConfig()
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
  const dirs = [PATHS.icloudDotsloth, PATHS.icloudDotfiles, PATHS.icloudOrganizations]

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
