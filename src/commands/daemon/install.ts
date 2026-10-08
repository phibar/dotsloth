import {Flags} from '@oclif/core'
import chalk from 'chalk'
import {BaseCommand} from '../../cli/base-command.js'
import {DEFAULT_INTERVAL_SECONDS, installDaemon} from '../../core/daemon.js'

export default class DaemonInstall extends BaseCommand {
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

    const result = installDaemon({intervalSeconds: flags.interval})

    if (result.nodeWarning?.kind === 'replaced') {
      this.log(
        chalk.dim(`Using ${result.nodePath} instead of the version-managed ${result.nodeWarning.versionManaged}`),
      )
    } else if (result.nodeWarning?.kind === 'version-managed') {
      this.warn(
        `node is version-managed (${result.nodePath}). launchd cannot use nvm shims, so the agent ` +
          'will stop working after your next node upgrade. Re-run "dotsloth daemon install" ' +
          'after upgrading, or install node via Homebrew.',
      )
    }

    const hours = (result.intervalSeconds / 3600).toFixed(1)
    this.log('')
    this.log(chalk.green('✓') + ' Periodic sync installed')
    this.log(chalk.dim(`  Every ${result.intervalSeconds}s (~${hours}h)`))
    this.log(chalk.dim(`  Plist:  ${result.plistPath}`))
    this.log(chalk.dim(`  Loaded: ${result.loaded ? 'yes' : 'no'}`))
    this.log('')
    this.log(chalk.dim('Logs: ~/Library/Logs/dotsloth/sync.log'))
    this.log('')
  }
}
