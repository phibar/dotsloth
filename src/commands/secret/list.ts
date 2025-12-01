import {Command} from '@oclif/core'
import chalk from 'chalk'

import {listSecretNames} from '../../lib/keychain.js'

export default class SecretList extends Command {
  static override description = 'List all secret names stored in Keychain'

  static override examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    const names = listSecretNames()

    if (names.length === 0) {
      this.log(chalk.yellow('No secrets stored'))
      this.log(chalk.dim("Run 'dotsloth secret add <name>' to add a secret"))
      return
    }

    this.log(chalk.bold(`\n🔐 Secrets in Keychain (${names.length}):\n`))
    for (const name of names) {
      this.log(`  ${chalk.cyan(name)}`)
    }

    this.log('')
    this.log(chalk.dim("Use 'dotsloth secret get <name>' to retrieve a value"))
  }
}
