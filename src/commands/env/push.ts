import {Flags} from '@oclif/core'
import chalk from 'chalk'
import {BaseCommand} from '../../cli/base-command.js'
import {printEnvTransfer} from '../../cli/env.js'
import {pushEnv} from '../../core/env.js'

export default class EnvPush extends BaseCommand {
  static override description = 'Copy env files from your repos into the dotsloth store'
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --dry-run']
  static override flags = {
    'dry-run': Flags.boolean({description: 'Show what would be copied without writing'}),
    force: Flags.boolean({char: 'f', description: 'Overwrite store entries that differ'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(EnvPush)

    this.log(chalk.bold('\n🦥 env push\n'))

    const result = pushEnv({dryRun: flags['dry-run'], force: flags.force})
    for (const transfer of result.transfers) {
      printEnvTransfer(this.log.bind(this), transfer, {conflict: 'differs from store', verb: 'copy'})
    }

    this.log('')
    this.log(`${result.copied} copied, ${result.skipped} skipped`)
    if (result.skipped > 0) {
      this.log(chalk.yellow('Resolve conflicts by hand, or re-run with --force'))
    }

    this.log(chalk.dim(`Store: ${result.store}`))
    this.log('')
  }
}
