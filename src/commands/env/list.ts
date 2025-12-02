import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {listIcloudEnvFiles} from '../../lib/env.js'

export default class EnvList extends Command {
  static override description = 'List all .env files stored in iCloud (source of truth)'
static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
  ]
static override flags = {
    json: Flags.boolean({description: 'Output as JSON'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(EnvList)

    const envFiles = listIcloudEnvFiles()

    if (flags.json) {
      this.log(JSON.stringify(envFiles, null, 2))
      return
    }

    if (envFiles.length === 0) {
      this.log(chalk.yellow('No .env files in iCloud'))
      this.log(chalk.dim("Run 'dotsloth env sync' to sync your .env files"))
      return
    }

    this.log(chalk.bold(`\n🔐 .env files in iCloud (${envFiles.length}):\n`))

    for (const envFile of envFiles) {
      const status = envFile.isSymlinked ? chalk.green('✓ linked') : chalk.yellow('○ orphaned')
      this.log(`  ${chalk.cyan(envFile.relativePath)} ${status}`)
    }

    const orphaned = envFiles.filter((f) => !f.isSymlinked)
    if (orphaned.length > 0) {
      this.log('')
      this.log(chalk.dim(`Run 'dotsloth env sync' to create symlinks for ${orphaned.length} orphaned file(s)`))
    }

    this.log('')
  }
}
