import chalk from 'chalk'

import type {SyncResult} from '../lib/sync.js'
import type {SymlinkStatus} from '../types/index.js'

/** Render a sync result as the familiar tick/cross list. */
export function printSyncResult(log: (message?: string) => void, result: SyncResult): void {
  for (const step of result.steps) {
    const mark = step.ok ? chalk.green('✓') : chalk.red('✗')
    log(`${mark} ${step.label}${step.detail ? chalk.dim(` — ${step.detail}`) : ''}`)
  }
}

/** One line per symlink: tick or cross, plus where an existing file was moved. */
export function printLinkResult(log: (message?: string) => void, label: string, result: SymlinkStatus): void {
  if (!result.isValid) {
    log(chalk.red('✗') + ` ${label}: ${result.error}`)
    return
  }

  log(chalk.green('✓') + ` ${label}`)
  if (result.backupPath) log(chalk.dim(`  backed up existing file to ${result.backupPath}`))
}
