import chalk from 'chalk'

import type {StepEvent} from '../core/events.js'
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

/** Print one progress event from a core operation. */
export function printStepEvent(log: (message?: string) => void, event: StepEvent): void {
  if (event.type === 'info') {
    log(chalk.dim(`  ${event.label}`))
  } else if (event.type === 'link') {
    printLinkResult(log, event.result.target, event.result)
  } else if (event.type === 'section') {
    log('')
    log(chalk.bold(event.label))
  } else {
    const mark = {error: chalk.red('✗'), ok: chalk.green('✓'), warning: chalk.yellow('!')}[event.status]
    log(`${mark} ${event.label}${event.detail ? chalk.dim(` — ${event.detail}`) : ''}`)
  }
}
