import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {getAllSecrets} from '../../lib/keychain.js'
import {generateExportStatements} from '../../lib/secrets.js'

export default class SecretExport extends Command {
  static override description = 'Export all secrets (for debugging/migration)'
static override examples = ['<%= config.bin %> <%= command.id %>']
static override flags = {
    format: Flags.string({
      char: 'f',
      default: 'shell',
      description: 'Output format',
      options: ['shell', 'json'],
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(SecretExport)

    const secrets = getAllSecrets()

    if (secrets.length === 0) {
      this.log(chalk.yellow('No secrets stored'))
      return
    }

    if (flags.format === 'json') {
      const output: Record<string, string> = {}
      for (const {name, value} of secrets) {
        output[name] = value
      }

      this.log(JSON.stringify(output, null, 2))
    } else {
      this.log(chalk.bold(`\n# Exported ${secrets.length} secret(s)\n`))
      this.log(generateExportStatements(secrets))
    }
  }
}
