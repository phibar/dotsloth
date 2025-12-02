import {Command} from '@oclif/core'
import chalk from 'chalk'

import {isDaemonRunning, loadDaemonState, markDaemonStopped} from '../../lib/daemon.js'

export default class DaemonStop extends Command {
  static override description = 'Stop the periodic sync daemon'
  static override examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    this.log(chalk.bold('\n🦥 Stopping dotsloth daemon...\n'))

    if (!isDaemonRunning()) {
      this.log(chalk.yellow('Daemon is not running'))
      // Clean up state file in case it's stale
      markDaemonStopped()
      return
    }

    const state = loadDaemonState()
    if (state.pid === null) {
      this.log(chalk.yellow('No daemon PID found'))
      markDaemonStopped()
      return
    }

    try {
      process.kill(state.pid, 'SIGTERM')
      this.log(chalk.green('✓') + ` Daemon stopped (PID: ${state.pid})`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        this.log(chalk.yellow('Daemon process not found (may have already stopped)'))
      } else {
        throw error
      }
    }

    markDaemonStopped()
    this.log('')
  }
}
