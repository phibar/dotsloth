import * as fs from 'node:fs'
import {
  ConfigError,
  configExists,
  ensureIcloudStructure,
  getDefaultConfig,
  isIcloudAccessible,
  readConfig,
  saveConfig,
} from '../lib/config.js'
import {generateMainGitconfig, readPublicKey, writeAllowedSigners, writeOrgGitconfig} from '../lib/git.js'
import {addSecret, addSshKeyToKeychain} from '../lib/keychain.js'
import {getIcloudDotfilePath, PATHS} from '../lib/paths.js'
import {countSecrets, extractSecrets} from '../lib/secrets.js'
import {createSymlink} from '../lib/symlink.js'
import type {DevSlothConfig} from '../types/index.js'
import {CoreError} from './errors.js'
import type {OnEvent, StepEvent} from './events.js'
import {ignoreEvents} from './events.js'

const MINIMAL_ZPROFILE = `# dotsloth managed zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"

# Load secrets from iCloud Keychain
eval "$(dotsloth secret load)"
`

const MINIMAL_SSH_CONFIG = `# dotsloth managed SSH config
Host *
    AddKeysToAgent yes
    UseKeychain yes
    IdentityFile ~/.ssh/id_ed25519

Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
`

/** What init would do, so a caller can ask its questions before anything runs. */
export interface InitPlan {
  configExists: boolean
  /** True when there is no org to take the git user name from: ask for it. */
  needsUserName: boolean
  /** Exports in ~/.zprofile that look like secrets: offer to move them to the Keychain. */
  secretsInZprofile: number
  sshKeyPath: null | string
}

export function getInitPlan({force = false} = {}): InitPlan {
  requireIcloud()
  const config = force ? null : existingConfig()
  const zprofile = fs.existsSync(PATHS.zprofile) ? fs.readFileSync(PATHS.zprofile, 'utf8') : ''

  return {
    configExists: configExists(),
    needsUserName: (config?.organizations.length ?? 0) === 0,
    secretsInZprofile: zprofile ? countSecrets(zprofile) : 0,
    sshKeyPath: fs.existsSync(PATHS.defaultSshKey) ? PATHS.defaultSshKey : null,
  }
}

export interface InitOptions {
  /** Add the default SSH key to the agent and Keychain (may prompt for its passphrase). */
  addSshKey?: boolean
  /** Move secrets found in ~/.zprofile to the Keychain. */
  extractSecrets?: boolean
  /** Replace an existing config with a fresh default one. */
  force?: boolean
  /** Git user name for the main gitconfig; required when the plan says so. */
  userName?: string
}

function requireIcloud(): void {
  if (!isIcloudAccessible()) {
    throw new CoreError('ICLOUD_UNAVAILABLE', 'iCloud Drive is not accessible. Please ensure iCloud Drive is enabled.')
  }
}

/** The existing config; a broken one is an error, never silently replaced (that is what --force is for). */
function existingConfig(): DevSlothConfig | null {
  try {
    return readConfig()
  } catch (error) {
    if (error instanceof ConfigError) {
      throw new CoreError('CONFIG_INVALID', 'config.json is invalid - fix it or re-run with --force', error.issues)
    }

    throw error
  }
}

/** Seed an iCloud dotfile from the local one, or from a minimal default. */
function seedDotfile(
  name: string,
  localPath: string,
  fallback: string,
  labels: {copied: string; created: string},
): null | StepEvent {
  const icloudPath = getIcloudDotfilePath(name)
  if (fs.existsSync(icloudPath)) return null

  if (fs.existsSync(localPath)) {
    fs.writeFileSync(icloudPath, fs.readFileSync(localPath, 'utf8'), 'utf8')
    return {label: labels.copied, status: 'ok', type: 'step'}
  }

  fs.writeFileSync(icloudPath, fallback, 'utf8')
  return {label: labels.created, status: 'ok', type: 'step'}
}

function moveSecretsToKeychain(emit: OnEvent<StepEvent>): void {
  const {cleanContent, secrets} = extractSecrets(fs.readFileSync(PATHS.zprofile, 'utf8'))
  for (const secret of secrets) {
    try {
      addSecret(secret.name, secret.value)
      emit({label: `Stored: ${secret.name}`, type: 'info'})
    } catch (error) {
      emit({detail: (error as Error).message, label: `Failed to store ${secret.name}`, status: 'error', type: 'step'})
    }
  }

  fs.writeFileSync(getIcloudDotfilePath('zprofile'), cleanContent, 'utf8')
  emit({label: `Extracted ${secrets.length} secret(s) to Keychain`, status: 'ok', type: 'step'})
  emit({label: 'Created clean zprofile in iCloud', status: 'ok', type: 'step'})
}

function writeGitFiles(config: DevSlothConfig, userName: string, emit: OnEvent<StepEvent>): void {
  fs.writeFileSync(getIcloudDotfilePath('gitconfig'), generateMainGitconfig(config, userName), 'utf8')
  emit({label: 'Generated gitconfig in iCloud', status: 'ok', type: 'step'})

  for (const org of config.organizations) writeOrgGitconfig(org)
  if (config.organizations.length > 0) {
    emit({label: `Generated ${config.organizations.length} org gitconfig(s)`, status: 'ok', type: 'step'})
  }
}

function writeAllowedSignersStep(config: DevSlothConfig): null | StepEvent {
  if (!config.sshSigning.enabled) return null

  const pubKeyPath = `${config.sshSigning.defaultKeyPath}.pub`
  const publicKey = readPublicKey(pubKeyPath)
  if (!publicKey) return {label: `Could not read public key from ${pubKeyPath}`, status: 'warning', type: 'step'}

  writeAllowedSigners(config, publicKey)
  return {label: 'Generated allowed_signers file', status: 'ok', type: 'step'}
}

/**
 * Set this machine up: config, iCloud dotfiles, gitconfigs, symlinks, SSH key.
 * Every step is reported through `onEvent` as it happens and returned at the end.
 */
export async function runInit(
  options: InitOptions = {},
  onEvent: OnEvent<StepEvent> = ignoreEvents,
): Promise<StepEvent[]> {
  const events: StepEvent[] = []
  const emit = (event: null | StepEvent) => {
    if (!event) return
    events.push(event)
    onEvent(event)
  }

  requireIcloud()
  emit({label: 'iCloud Drive accessible', status: 'ok', type: 'step'})

  ensureIcloudStructure()
  emit({label: 'iCloud directory structure created', status: 'ok', type: 'step'})

  let config = options.force ? null : existingConfig()
  if (config) {
    emit({label: 'Existing configuration found', status: 'ok', type: 'step'})
  } else {
    config = getDefaultConfig()
    saveConfig(config)
    emit({label: 'Created new configuration', status: 'ok', type: 'step'})
  }

  const userName = config.organizations[0]?.gitUsername ?? options.userName?.trim()
  if (!userName) throw new CoreError('INVALID_INPUT', 'A git user name is required when no organization exists yet')

  if (options.extractSecrets && fs.existsSync(PATHS.zprofile)) moveSecretsToKeychain(emit)

  emit(
    seedDotfile('zprofile', PATHS.zprofile, MINIMAL_ZPROFILE, {
      copied: 'Copied zprofile to iCloud',
      created: 'Created minimal zprofile in iCloud',
    }),
  )
  writeGitFiles(config, userName, emit)
  emit(
    seedDotfile('ssh_config', PATHS.sshConfig, MINIMAL_SSH_CONFIG, {
      copied: 'Copied SSH config to iCloud',
      created: 'Created SSH config in iCloud',
    }),
  )
  emit(writeAllowedSignersStep(config))

  emit({label: 'Creating symlinks...', type: 'section'})
  for (const syncedFile of config.syncedFiles) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential on purpose, each link reports its own line
    emit({result: await createSymlink({backup: true, ...syncedFile}), type: 'link'})
  }

  if (options.addSshKey && fs.existsSync(PATHS.defaultSshKey)) {
    try {
      addSshKeyToKeychain(PATHS.defaultSshKey)
      emit({label: 'Added SSH key to Keychain', status: 'ok', type: 'step'})
    } catch {
      emit({label: 'Could not add SSH key to Keychain (may already be added)', status: 'warning', type: 'step'})
    }
  }

  if (!fs.existsSync(config.paths.githubRoot)) {
    fs.mkdirSync(config.paths.githubRoot, {recursive: true})
    emit({label: `Created ${config.paths.githubRoot}`, status: 'ok', type: 'step'})
  }

  return events
}
