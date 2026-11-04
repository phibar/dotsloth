/*
 * Purpose: CLI command that syncs ~/github/topics/<topic>/<repo> symlinks from GitHub repo topics.
 * Intention: realizes BaseCommand, uses runTopicsSync from core/topics, printSyncResult from cli/format.
 */

import {Flags} from '@oclif/core'
import chalk from 'chalk'

import {BaseCommand} from '../cli/base-command.js'
import {printSyncResult} from '../cli/format.js'
import {runTopicsSync} from '../core/topics.js'

export default class Topics extends BaseCommand {
  static override description = 'Sync ~/github/topics/<topic>/<repo> symlinks from GitHub repo topics'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --dry-run',
    '<%= config.bin %> <%= command.id %> --offline',
  ]
  static override flags = {
    'dry-run': Flags.boolean({description: 'Show what would change without touching the filesystem'}),
    offline: Flags.boolean({description: 'Only prune stale symlinks; skip fetching topics from GitHub'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Topics)

    this.log(chalk.bold('\n🦥 dotsloth topics\n'))
    if (flags['dry-run']) this.log(chalk.yellow('Dry run mode — no changes will be made\n'))

    const result = await runTopicsSync({dryRun: flags['dry-run'], offline: flags.offline})

    for (const warning of result.warnings) {
      this.log(chalk.yellow('!') + ' ' + warning)
    }

    if (result.warnings.length > 0) this.log('')

    if (result.steps.length === 0) {
      this.log(chalk.dim('Nothing to do — no locally cloned repos have GitHub topics'))
    } else {
      printSyncResult(this.log.bind(this), result)
    }

    this.log('')
    if (result.ok) {
      this.log(chalk.bold.green('🦥 Topics synced!'))
    } else {
      this.log(chalk.bold.yellow('🦥 Topics sync finished with errors'))
    }

    this.log('')
  }
}
