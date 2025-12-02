import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {loadConfig} from '../../lib/config.js'
import {backupAllEnvFiles, scanForEnvFiles} from '../../lib/env.js'
import {PATHS} from '../../lib/paths.js'

export default class EnvBackup extends Command {
  static override description = 'Backup .env files to iCloud for secure storage and sync'
static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --force',
  ]
static override flags = {
    force: Flags.boolean({char: 'f', description: 'Backup all files without confirmation'}),
  }

  public async run(): Promise<void> {
    await this.parse(EnvBackup)

    const config = loadConfig()
    const githubRoot = config?.paths.githubRoot ?? PATHS.githubRoot

    this.log(chalk.bold('\n🦥 dotsloth env backup\n'))

    const envFiles = scanForEnvFiles(githubRoot)

    if (envFiles.length === 0) {
      this.log(chalk.yellow('No .env files found to backup'))
      return
    }

    this.log(chalk.dim(`Found ${envFiles.length} .env file(s) to backup\n`))

    const {backed, failed, results} = backupAllEnvFiles(githubRoot)

    for (const {envFile, success} of results) {
      if (success) {
        this.log(chalk.green('✓') + ` ${envFile.relativePath}`)
      } else {
        this.log(chalk.red('✗') + ` ${envFile.relativePath} (failed to backup)`)
      }
    }

    this.log('')
    if (backed > 0) {
      this.log(chalk.green(`✓ Backed up ${backed} file(s) to iCloud`))
      this.log(chalk.dim('  Files will sync across your devices via iCloud'))
    }

    if (failed > 0) {
      this.log(chalk.red(`✗ Failed to backup ${failed} file(s)`))
    }

    this.log('')
  }
}
