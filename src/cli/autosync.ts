import chalk from 'chalk'

import type {SyncResult} from '../lib/sync.js'

import {runSync} from '../lib/sync.js'

/**
 * Report the sync a config-changing command ran.
 *
 * Config changes are only half the job: ~/.gitconfig and the org includeIf
 * patterns are generated artefacts, so a command that edits config.json and
 * stops leaves the machine in a state where the change has not actually
 * applied (#1). Core operations sync themselves; this prints the outcome.
 */
export function printAutoSync(log: (message?: string) => void, result: SyncResult, {quiet = false} = {}): void {
  if (result.ok) {
    if (!quiet) {
      log(chalk.dim('↻ Synced — ~/.gitconfig and symlinks are up to date'))
    }

    return
  }

  log(chalk.yellow('! Sync reported problems:'))
  for (const step of result.steps.filter((s) => !s.ok)) {
    log(chalk.yellow(`  - ${step.label}${step.detail ? ` (${step.detail})` : ''}`))
  }
}

/** Run a sync on behalf of a command that changed config outside src/core, and report it. */
export async function autoSync(log: (message?: string) => void, {quiet = false} = {}): Promise<void> {
  printAutoSync(log, await runSync(), {quiet})
}
