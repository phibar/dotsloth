import {Flags} from '@oclif/core'
import chalk from 'chalk'
import {BaseCommand} from '../../cli/base-command.js'
import {printEnvTransfer} from '../../cli/env.js'
import {envStoreIsEmpty, pullEnv} from '../../core/env.js'

export default class EnvPull extends BaseCommand {
  static override description = 'Restore env files from the dotsloth store into your repos'
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --force']
  static override flags = {
    'dry-run': Flags.boolean({description: 'Show what would be restored without writing'}),
    force: Flags.boolean({char: 'f', description: 'Overwrite local files that differ'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(EnvPull)

    if (envStoreIsEmpty()) {
      this.log(chalk.dim('Store is empty — nothing to restore.'))
      return
    }

    this.log(chalk.bold('\n🦥 env pull\n'))

    const result = pullEnv({dryRun: flags['dry-run'], force: flags.force})
    for (const transfer of result.transfers) {
      printEnvTransfer(this.log.bind(this), transfer, {conflict: 'local differs', verb: 'restore'})
    }

    this.log('')
    this.log(`${result.copied} restored, ${result.skipped} skipped`)
    this.log('')
  }
}
