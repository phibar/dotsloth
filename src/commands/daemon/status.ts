import {Command} from '@oclif/core'
import chalk from 'chalk'

import {isInstalled, isLoaded, PLIST_PATH, readInterval, tailLog} from '../../lib/daemon.js'

export default class DaemonStatus extends Command {
  static override description = 'Show whether periodic sync is installed and when it last ran'
static override examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    this.log(chalk.bold('\n🦥 periodic sync\n'))

    if (!isInstalled()) {
      this.log(chalk.yellow('Not installed') + chalk.dim(' — run "dotsloth daemon install"'))
      this.log('')
      return
    }

    const interval = readInterval()
    this.log(chalk.green('✓') + ' Installed')
    this.log(chalk.dim(`  Plist:    ${PLIST_PATH}`))
    this.log(chalk.dim(`  Interval: ${interval ?? 'unknown'}s`))
    this.log(`  ${isLoaded() ? chalk.green('Loaded in launchd') : chalk.red('NOT loaded in launchd')}`)

    const log = tailLog(15).trim()
    if (log) {
      this.log('')
      this.log(chalk.bold('Last run:'))
      for (const line of log.split('\n')) this.log(chalk.dim(`  ${line}`))
    }

    this.log('')
  }
}
