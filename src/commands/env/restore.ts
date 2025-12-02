import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {listBackedUpEnvFiles, restoreAllEnvFiles} from '../../lib/env.js'

export default class EnvRestore extends Command {
  static override description = 'Restore .env files from iCloud to projects'
static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --force',
  ]
static override flags = {
    force: Flags.boolean({char: 'f', description: 'Restore all files without confirmation'}),
  }

  public async run(): Promise<void> {
    await this.parse(EnvRestore)

    this.log(chalk.bold('\n🦥 dotsloth env restore\n'))

    const backedUpFiles = listBackedUpEnvFiles()

    if (backedUpFiles.length === 0) {
      this.log(chalk.yellow('No backed up .env files found in iCloud'))
      this.log(chalk.dim("Run 'dotsloth env backup' first to backup your .env files"))
      return
    }

    this.log(chalk.dim(`Found ${backedUpFiles.length} backed up .env file(s)\n`))

    const {failed, restored, results} = restoreAllEnvFiles()

    for (const {envFile, success} of results) {
      if (success) {
        this.log(chalk.green('✓') + ` ${envFile.relativePath}`)
      } else {
        this.log(chalk.red('✗') + ` ${envFile.relativePath} (failed to restore)`)
      }
    }

    this.log('')
    if (restored > 0) {
      this.log(chalk.green(`✓ Restored ${restored} file(s) from iCloud`))
    }

    if (failed > 0) {
      this.log(chalk.red(`✗ Failed to restore ${failed} file(s)`))
    }

    this.log('')
  }
}
