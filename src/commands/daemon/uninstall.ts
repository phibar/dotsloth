import chalk from 'chalk'
import {BaseCommand} from '../../cli/base-command.js'
import {uninstallDaemon} from '../../core/daemon.js'

export default class DaemonUninstall extends BaseCommand {
  static override description = 'Remove the periodic sync agent'
  static override examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    if (!uninstallDaemon().removed) {
      this.log(chalk.dim('Periodic sync is not installed.'))
      return
    }

    this.log(chalk.green('✓') + ' Periodic sync removed')
  }
}
