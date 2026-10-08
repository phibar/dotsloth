import {Command} from '@oclif/core'
import chalk from 'chalk'

import {isInstalled, uninstall} from '../../lib/daemon.js'

export default class DaemonUninstall extends Command {
  static override description = 'Remove the periodic sync agent'
  static override examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    if (!isInstalled()) {
      this.log(chalk.dim('Periodic sync is not installed.'))
      return
    }

    uninstall()
    this.log(chalk.green('✓') + ' Periodic sync removed')
  }
}
