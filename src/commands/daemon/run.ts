import * as fs from 'node:fs'

import {Command, Flags} from '@oclif/core'

import {
  markDaemonStopped,
  parseInterval,
  updateLastSyncTime,
} from '../../lib/daemon.js'
import {PATHS} from '../../lib/paths.js'

export default class DaemonRun extends Command {
  static override description = 'Internal command to run the daemon loop (use "daemon start" instead)'
  static override flags = {
    interval: Flags.string({
      char: 'i',
      default: '24h',
      description: 'Sync interval',
    }),
  }
  static override hidden = true

  public async run(): Promise<void> {
    const {flags} = await this.parse(DaemonRun)

    const intervalMs = parseInterval(flags.interval)

    // Set up graceful shutdown
    const cleanup = () => {
      markDaemonStopped()
      process.exit(0)
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)

    // Run initial sync
    await this.runSync()

    // Set up periodic sync
    setInterval(async () => {
      await this.runSync()
    }, intervalMs)

    // Keep process running indefinitely
    await new Promise<never>(() => {})
  }

  private logError(message: string): void {
    const logPath = `${PATHS.localConfig}/daemon.log`
    const timestamp = new Date().toISOString()
    const logLine = `[${timestamp}] ERROR: ${message}\n`
    try {
      fs.mkdirSync(PATHS.localConfig, {recursive: true})
      fs.appendFileSync(logPath, logLine)
    } catch {
      // Ignore logging errors
    }
  }

  private async runSync(): Promise<void> {
    try {
      // Dynamically import and run sync command
      const {default: Sync} = await import('../sync.js')
      const sync = new Sync([], this.config)
      await sync.run()
      updateLastSyncTime()
    } catch (error) {
      // Log error but continue - daemon should keep running even if sync fails
      this.logError(error instanceof Error ? error.message : String(error))
    }
  }
}
