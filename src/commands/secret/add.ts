import {confirm, password} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import chalk from 'chalk'
import {BaseCommand} from '../../cli/base-command.js'
import {normalizeSecretName, secretExists, setSecret} from '../../core/secrets.js'

/**
 * Purpose: store a secret in the Keychain.
 *
 * Intention: extends BaseCommand; uses core/secrets; asks for the value
 * hidden.
 */
export default class SecretAdd extends BaseCommand {
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

    const name = normalizeSecretName(args.name)

    const exists = secretExists(name)
    if (exists) {
      const confirmed = await confirm({default: false, message: `Secret '${name}' already exists. Overwrite?`})

      if (!confirmed) {
        this.log(chalk.yellow('Cancelled'))
        return
      }
    }

    const value = flags.value || (await password({mask: true, message: `Enter value for ${name}:`}))

    setSecret(name, value, {overwrite: exists})
    this.log(chalk.green(`✓ Secret '${name}' stored in Keychain`))
    this.log(chalk.dim('  This will sync across your devices via iCloud Keychain'))
  }
}
