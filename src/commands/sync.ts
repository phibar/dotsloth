import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import type {SyncResult} from '../lib/sync.js'

import {runSync} from '../lib/sync.js'

/** Render a sync result as the familiar tick/cross list. */
export function printSyncResult(log: (message?: string) => void, result: SyncResult): void {
  for (const step of result.steps) {
    const mark = step.ok ? chalk.green('✓') : chalk.red('✗')
    log(`${mark} ${step.label}${step.detail ? chalk.dim(` — ${step.detail}`) : ''}`)
  }
}

export default class Sync extends Command {
  static override description = 'Sync configurations from iCloud Drive'
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --dry-run']
  static override flags = {
    'dry-run': Flags.boolean({description: 'Show what would be synced without making changes'}),
    force: Flags.boolean({char: 'f', description: 'Force overwrite local files'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Sync)

    this.log(chalk.bold('\n🦥 dotsloth sync\n'))
    if (flags['dry-run']) {
      this.log(chalk.yellow('Dry run mode - no changes will be made\n'))
    }

    const result = await runSync({dryRun: flags['dry-run'], force: flags.force})
    printSyncResult(this.log.bind(this), result)

    this.log('')
    if (result.ok) {
      this.log(chalk.bold.green('🦥 Sync complete!'))
    } else {
      this.log(chalk.bold.yellow('🦥 Sync finished with warnings'))
    }

    this.log('')
  }
}
