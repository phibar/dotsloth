import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {
  DEFAULT_INTERVAL_SECONDS,
  findStableNode,
  install,
  isLoaded,
  isVersionedNodePath,
  PLIST_PATH,
} from '../../lib/daemon.js'

/** Resolve bin/run.js from this module, so the plist points at a real path. */
function resolveBin(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  // dist/commands/daemon -> package root
  return path.resolve(here, '../../../bin/run.js')
}

export default class DaemonInstall extends Command {
  static override description = 'Install the periodic sync agent (runs dotsloth sync on a schedule)'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --interval 3600',
  ]
  static override flags = {
    interval: Flags.integer({
      default: DEFAULT_INTERVAL_SECONDS,
      description: 'Seconds between syncs (default: once a day)',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(DaemonInstall)

    if (flags.interval < 60) {
      this.error('Interval must be at least 60 seconds')
    }

    const binPath = resolveBin()

    // Prefer a node that survives version upgrades. nvm/fnm/volta paths embed
    // the version number and disappear on the next upgrade, which would leave
    // the agent silently dead rather than visibly broken.
    let nodePath = process.execPath
    if (isVersionedNodePath(nodePath)) {
      const stable = findStableNode()
      if (stable) {
        this.log(chalk.dim(`Using ${stable} instead of the version-managed ${nodePath}`))
        nodePath = stable
      } else {
        this.warn(
          `node is version-managed (${nodePath}). launchd cannot use nvm shims, so the agent ` +
            'will stop working after your next node upgrade. Re-run "dotsloth daemon install" ' +
            'after upgrading, or install node via Homebrew.',
        )
      }
    }

    install({binPath, intervalSeconds: flags.interval, nodePath})

    const hours = (flags.interval / 3600).toFixed(1)
    this.log('')
    this.log(chalk.green('✓') + ' Periodic sync installed')
    this.log(chalk.dim(`  Every ${flags.interval}s (~${hours}h)`))
    this.log(chalk.dim(`  Plist:  ${PLIST_PATH}`))
    this.log(chalk.dim(`  Loaded: ${isLoaded() ? 'yes' : 'no'}`))
    this.log('')
    this.log(chalk.dim('Logs: ~/Library/Logs/dotsloth/sync.log'))
    this.log('')
  }
}
