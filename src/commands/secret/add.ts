import {Args, Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import Enquirer from 'enquirer'

import {addSecret, getSecret} from '../../lib/keychain.js'

export default class SecretAdd extends Command {
  static override args = {
    name: Args.string({description: 'Secret name (e.g., AWS_ACCESS_KEY_ID)', required: true}),
  }

  static override description = 'Add or update a secret in macOS Keychain'

  static override examples = [
    '<%= config.bin %> <%= command.id %> AWS_ACCESS_KEY_ID',
    '<%= config.bin %> <%= command.id %> OPENAI_API_KEY --value sk-...',
  ]

  static override flags = {
    value: Flags.string({char: 'v', description: 'Secret value (not recommended - use prompt instead)'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(SecretAdd)

    const name = args.name.toUpperCase()

    // Check if secret already exists
    const existing = getSecret(name)
    if (existing) {
      const {confirm} = await Enquirer.prompt<{confirm: boolean}>({
        type: 'confirm',
        name: 'confirm',
        message: `Secret '${name}' already exists. Overwrite?`,
        initial: false,
      })

      if (!confirm) {
        this.log(chalk.yellow('Cancelled'))
        return
      }
    }

    // Get value
    let value = flags.value
    if (!value) {
      const response = await Enquirer.prompt<{value: string}>({
        type: 'password',
        name: 'value',
        message: `Enter value for ${name}:`,
      })
      value = response.value
    }

    if (!value) {
      this.error('Secret value cannot be empty')
    }

    // Store in keychain
    try {
      addSecret(name, value)
      this.log(chalk.green(`✓ Secret '${name}' stored in Keychain`))
      this.log(chalk.dim('  This will sync across your devices via iCloud Keychain'))
    } catch (error) {
      this.error(`Failed to store secret: ${error instanceof Error ? error.message : error}`)
    }
  }
}
