import chalk from 'chalk'
import {BaseCommand} from '../../cli/base-command.js'
import {getDaemonStatus} from '../../core/daemon.js'

export default class DaemonStatus extends BaseCommand {
  static override description = 'Show whether periodic sync is installed and when it last ran'
  static override examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    this.log(chalk.bold('\n🦥 periodic sync\n'))

    const status = getDaemonStatus()
    if (!status.installed) {
      this.log(chalk.yellow('Not installed') + chalk.dim(' — run "dotsloth daemon install"'))
      this.log('')
      return
    }

    this.log(chalk.green('✓') + ' Installed')
    this.log(chalk.dim(`  Plist:    ${status.plistPath}`))
    this.log(chalk.dim(`  Interval: ${status.intervalSeconds ?? 'unknown'}s`))
    this.log(`  ${status.loaded ? chalk.green('Loaded in launchd') : chalk.red('NOT loaded in launchd')}`)

    if (status.recentLog.length > 0) {
      this.log('')
      this.log(chalk.bold('Last run:'))
      for (const line of status.recentLog) this.log(chalk.dim(`  ${line}`))
    }

    this.log('')
  }
}
