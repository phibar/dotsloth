import {Args} from '@oclif/core'
import {BaseCommand} from '../../cli/base-command.js'
import {revealSecret} from '../../core/secrets.js'

export default class SecretGet extends BaseCommand {
  static override args = {
    name: Args.string({description: 'Secret name to retrieve', required: true}),
  }
  static override description = 'Get a secret value from Keychain'
  static override examples = ['<%= config.bin %> <%= command.id %> AWS_ACCESS_KEY_ID']

  public async run(): Promise<void> {
    const {args} = await this.parse(SecretGet)

    // Output just the value for easy piping
    this.log(revealSecret(args.name))
  }
}
