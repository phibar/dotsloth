import {confirm} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import chalk from 'chalk'
import {BaseCommand} from '../../cli/base-command.js'
import {normalizeSecretName, removeSecret, secretExists} from '../../core/secrets.js'

/**
 * Purpose: delete a secret, once confirmed.
 *
 * Intention: extends BaseCommand; uses core/secrets.
 */
export default class SecretRemove extends BaseCommand {
  static override args = {
    name: Args.string({description: 'Secret name to remove', required: true}),
  }
  static override description = 'Remove a secret from Keychain'
  static override examples = ['<%= config.bin %> <%= command.id %> AWS_ACCESS_KEY_ID']
  static override flags = {
    force: Flags.boolean({char: 'f', description: 'Skip confirmation'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(SecretRemove)

    const name = normalizeSecretName(args.name)
    if (!secretExists(name)) {
      this.error(`Secret '${name}' not found`)
    }

    if (!flags.force) {
      const confirmed = await confirm({default: false, message: `Are you sure you want to delete '${name}'?`})

      if (!confirmed) {
        this.log(chalk.yellow('Cancelled'))
        return
      }
    }

    removeSecret(name)
    this.log(chalk.green(`✓ Secret '${name}' removed from Keychain`))
  }
}
