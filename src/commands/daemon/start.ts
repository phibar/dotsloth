import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'

import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {
  formatInterval,
  isDaemonRunning,
  loadDaemonState,
  markDaemonStarted,
  parseInterval,
} from '../../lib/daemon.js'

export default class DaemonStart extends Command {
  static override description = 'Start the periodic sync daemon'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --interval 12h',
    '<%= config.bin %> <%= command.id %> --interval 1d',
  ]

  static override flags = {
    foreground: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Run in foreground (for debugging)',
    }),
    interval: Flags.string({
      char: 'i',
      default: '24h',
      description: 'Sync interval (e.g., 1h, 12h, 24h, 1d)',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(DaemonStart)

    // Check if daemon is already running
    if (isDaemonRunning()) {
      const state = loadDaemonState()
      this.log(chalk.yellow(`Daemon is already running (PID: ${state.pid})`))
      this.log(chalk.dim('Use "dotsloth daemon stop" to stop it first'))
      return
    }

    // Parse interval
    let intervalMs: number
    try {
      intervalMs = parseInterval(flags.interval)
    } catch (error) {
      this.error(error instanceof Error ? error.message : 'Invalid interval')
    }

    if (flags.foreground) {
      // Run in foreground for debugging
      this.log(chalk.bold('\n🦥 dotsloth daemon (foreground mode)\n'))
      this.log(`Sync interval: ${formatInterval(intervalMs)}`)
      this.log(chalk.dim('Press Ctrl+C to stop\n'))

      markDaemonStarted(process.pid, intervalMs)

      // Run initial sync
      await this.runSync()

      // Set up periodic sync
      const interval = setInterval(async () => {
        await this.runSync()
      }, intervalMs)

      // Handle graceful shutdown
      const cleanup = () => {
        clearInterval(interval)
        this.log('\n' + chalk.dim('Daemon stopped'))
        process.exit(0)
      }

      process.on('SIGINT', cleanup)
      process.on('SIGTERM', cleanup)

      // Keep process running indefinitely
      await new Promise<never>(() => {})
    } else {
      // Spawn daemon in background
      this.log(chalk.bold('\n🦥 Starting dotsloth daemon...\n'))

      // Get the path to the CLI entry point
      const binPath = fileURLToPath(new URL('../../../bin/run.js', import.meta.url))

      const child = spawn(process.execPath, [binPath, 'daemon', 'run', '--interval', flags.interval], {
        detached: true,
        env: {...process.env},
        stdio: 'ignore',
      })

      child.unref()

      if (child.pid) {
        markDaemonStarted(child.pid, intervalMs)
        this.log(chalk.green('✓') + ` Daemon started (PID: ${child.pid})`)
        this.log(chalk.dim(`  Sync interval: ${formatInterval(intervalMs)}`))
        this.log(chalk.dim('  Use "dotsloth daemon status" to check status'))
        this.log(chalk.dim('  Use "dotsloth daemon stop" to stop'))
      } else {
        this.error('Failed to start daemon')
      }
    }

    this.log('')
  }

  private async runSync(): Promise<void> {
    const timestamp = new Date().toLocaleString()
    this.log(chalk.dim(`[${timestamp}] Running sync...`))

    try {
      // Dynamically import and run sync command
      const {default: Sync} = await import('../sync.js')
      const sync = new Sync(this.argv, this.config)
      await sync.run()
    } catch (error) {
      this.log(chalk.red(`Sync failed: ${error instanceof Error ? error.message : error}`))
    }
  }
}
