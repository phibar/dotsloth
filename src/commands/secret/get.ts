import {Args, Command} from '@oclif/core'

import {getSecret} from '../../lib/keychain.js'

export default class SecretGet extends Command {
  static override args = {
    name: Args.string({description: 'Secret name to retrieve', required: true}),
  }
static override description = 'Get a secret value from Keychain'
static override examples = ['<%= config.bin %> <%= command.id %> AWS_ACCESS_KEY_ID']

  public async run(): Promise<void> {
    const {args} = await this.parse(SecretGet)

    const name = args.name.toUpperCase()
    const value = getSecret(name)

    if (value === null) {
      this.error(`Secret '${name}' not found`)
    }

    // Output just the value for easy piping
    this.log(value)
  }
}
