import * as fs from 'node:fs'

import type {DevSlothConfig} from '../types/index.js'

import {isIcloudAccessible, loadConfig, saveConfig} from './config.js'
import {generateMainGitconfig, readPublicKey, writeAllowedSigners, writeOrgGitconfig} from './git.js'
import {getIcloudDotfilePath} from './paths.js'
import {createSymlink} from './symlink.js'

export interface SyncOptions {
  /** Report what would change without touching the filesystem */
  dryRun?: boolean
  /** Replace existing files instead of backing them up */
  force?: boolean
}

export interface SyncStep {
  detail?: string
  label: string
  ok: boolean
}

export interface SyncResult {
  ok: boolean
  steps: SyncStep[]
}

/**
 * Apply the full dotsloth configuration to this machine.
 *
 * This is the single implementation behind `dotsloth sync` and the implicit
 * sync that every config-mutating command performs. Mutating config.json
 * without running this leaves ~/.gitconfig stale, which is the whole of #1 —
 * a new org's identity silently did not apply until the user ran sync by hand.
 */
export async function runSync(options: SyncOptions = {}): Promise<SyncResult> {
  const {dryRun = false, force = false} = options
  const steps: SyncStep[] = []
  const add = (ok: boolean, label: string, detail?: string) => steps.push({detail, label, ok})

  if (!isIcloudAccessible()) {
    add(false, 'iCloud Drive is not accessible')
    return {ok: false, steps}
  }

  // autoSync=false: runSync regenerates org gitconfigs itself, below.
  const config: DevSlothConfig | null = loadConfig(false)
  if (!config) {
    add(false, 'No configuration found', 'Run "dotsloth init" first')
    return {ok: false, steps}
  }

  // Organization gitconfigs
  for (const org of config.organizations) {
    if (!dryRun) {
      writeOrgGitconfig(org)
    }

    add(true, `Organization ${org.name}`, org.gitEmail)
  }

  // Main gitconfig, with the includeIf patterns that route each org to its identity
  const userName = config.organizations.length > 0 ? config.organizations[0].gitUsername : 'Your Name'
  if (!dryRun) {
    fs.writeFileSync(getIcloudDotfilePath('gitconfig'), generateMainGitconfig(config, userName), 'utf8')
  }

  add(true, 'Generated gitconfig with includeIf patterns')

  // SSH signing
  if (config.sshSigning.enabled) {
    const pubKeyPath = `${config.sshSigning.defaultKeyPath}.pub`
    const publicKey = readPublicKey(pubKeyPath)
    if (publicKey) {
      if (!dryRun) {
        writeAllowedSigners(config, publicKey)
      }

      add(true, 'Updated allowed_signers')
    } else {
      add(false, 'Could not read public key', pubKeyPath)
    }
  }

  // Symlinks
  for (const syncedFile of config.syncedFiles) {
    if (!fs.existsSync(syncedFile.source)) {
      add(false, `Source missing: ${syncedFile.source}`)
      continue
    }

    if (dryRun) {
      add(true, `Would link: ${syncedFile.target}`, syncedFile.source)
      continue
    }

    // biome-ignore lint/performance/noAwaitInLoops: sequential on purpose, each link reports its own line
    const result = await createSymlink({backup: !force, source: syncedFile.source, target: syncedFile.target})
    add(result.isValid, result.target, result.error)
  }

  if (!dryRun) {
    saveConfig(config)
  }

  return {ok: steps.every((s) => s.ok), steps}
}
