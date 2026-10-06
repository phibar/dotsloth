import chalk from 'chalk'

import {runSync} from './sync.js'

/**
 * Run a sync on behalf of a command that just changed the configuration.
 *
 * Config changes are only half the job: ~/.gitconfig and the org includeIf
 * patterns are generated artefacts, so a command that edits config.json and
 * stops leaves the machine in a state where the change has not actually
 * applied (#1). Commands call this instead of printing "now run sync".
 */
export async function autoSync(log: (message?: string) => void, {quiet = false} = {}): Promise<void> {
  const result = await runSync()

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
