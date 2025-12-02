import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {listBackedUpEnvFiles} from '../../lib/env.js'

export default class EnvList extends Command {
  static override description = 'List all backed up .env files in iCloud'
static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
  ]
static override flags = {
    json: Flags.boolean({description: 'Output as JSON'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(EnvList)

    const envFiles = listBackedUpEnvFiles()

    if (flags.json) {
      this.log(JSON.stringify(envFiles, null, 2))
      return
    }

    if (envFiles.length === 0) {
      this.log(chalk.yellow('No .env files backed up in iCloud'))
      this.log(chalk.dim("Run 'dotsloth env backup' to backup your .env files"))
      return
    }

    this.log(chalk.bold(`\n🔐 Backed up .env files (${envFiles.length}):\n`))

    for (const envFile of envFiles) {
      this.log(`  ${chalk.cyan(envFile.relativePath)}`)
    }

    this.log('')
    this.log(chalk.dim("Use 'dotsloth env restore' to restore files to projects"))
    this.log('')
  }
}
