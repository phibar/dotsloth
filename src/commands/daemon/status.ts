import {Command} from '@oclif/core'
import chalk from 'chalk'

import {formatInterval, isDaemonRunning, loadDaemonState} from '../../lib/daemon.js'

export default class DaemonStatus extends Command {
  static override description = 'Show the status of the periodic sync daemon'

  static override examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    this.log(chalk.bold('\n🦥 dotsloth daemon status\n'))

    const state = loadDaemonState()
    const running = isDaemonRunning()

    this.log(chalk.bold('Status:'))
    if (running) {
      this.log(`  ${chalk.green('●')} Running (PID: ${state.pid})`)
    } else {
      this.log(`  ${chalk.dim('○')} Not running`)
    }

    this.log('')
    this.log(chalk.bold('Configuration:'))
    this.log(`  Sync interval: ${formatInterval(state.intervalMs)}`)

    if (state.startedAt) {
      this.log('')
      this.log(chalk.bold('Timing:'))
      this.log(`  Started at: ${new Date(state.startedAt).toLocaleString()}`)

      if (state.lastSyncTime) {
        const lastSync = new Date(state.lastSyncTime)
        const nextSync = new Date(lastSync.getTime() + state.intervalMs)
        this.log(`  Last sync: ${lastSync.toLocaleString()}`)

        if (running) {
          this.log(`  Next sync: ${nextSync.toLocaleString()}`)
        }
      } else {
        this.log(chalk.dim('  No sync completed yet'))
      }
    }

    this.log('')
  }
}
