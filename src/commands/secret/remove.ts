import {Args, Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import Enquirer from 'enquirer'

import {deleteSecret, getSecret} from '../../lib/keychain.js'

export default class SecretRemove extends Command {
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

    const name = args.name.toUpperCase()

    // Check if secret exists
    const existing = getSecret(name)
    if (existing === null) {
      this.error(`Secret '${name}' not found`)
    }

    // Confirm deletion
    if (!flags.force) {
      const {confirm} = await Enquirer.prompt<{confirm: boolean}>({
        type: 'confirm',
        name: 'confirm',
        message: `Are you sure you want to delete '${name}'?`,
        initial: false,
      })

      if (!confirm) {
        this.log(chalk.yellow('Cancelled'))
        return
      }
    }

    // Delete from keychain
    const success = deleteSecret(name)
    if (success) {
      this.log(chalk.green(`✓ Secret '${name}' removed from Keychain`))
    } else {
      this.error(`Failed to remove secret '${name}'`)
    }
  }
}
