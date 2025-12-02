import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import * as fs from 'node:fs'

import {loadConfig} from '../../lib/config.js'
import {getEnvFilesStatus} from '../../lib/env.js'
import {PATHS} from '../../lib/paths.js'

export default class EnvStatus extends Command {
  static override description = 'Show status of .env files (symlink status and sync state)'
static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
  ]
static override flags = {
    json: Flags.boolean({description: 'Output as JSON'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(EnvStatus)

    const config = loadConfig()
    const githubRoot = config?.paths.githubRoot ?? PATHS.githubRoot

    const envFilesStatus = getEnvFilesStatus(githubRoot)

    if (flags.json) {
      this.log(JSON.stringify(envFilesStatus, null, 2))
      return
    }

    this.log(chalk.bold('\n🦥 dotsloth env status\n'))

    // Check if iCloud env files directory exists
    if (!fs.existsSync(PATHS.icloudEnvFiles)) {
      this.log(chalk.dim('iCloud env files directory not yet created'))
      this.log(chalk.dim("Run 'dotsloth env sync' to start syncing .env files\n"))
    }

    if (envFilesStatus.length === 0) {
      this.log(chalk.yellow('No .env files found'))
      this.log(chalk.dim(`Searched in: ${githubRoot}`))
      return
    }

    // Group by status
    const synced = envFilesStatus.filter((f) => f.status === 'synced')
    const unsynced = envFilesStatus.filter((f) => f.status === 'unsynced')
    const regularFiles = envFilesStatus.filter((f) => f.status === 'regular-file')
    const conflicts = envFilesStatus.filter((f) => f.status === 'conflict')
    const orphaned = envFilesStatus.filter((f) => f.status === 'orphaned')

    if (synced.length > 0) {
      this.log(chalk.bold('✓ Synced (symlinks to iCloud):'))
      for (const file of synced) {
        this.log(`  ${chalk.green('●')} ${chalk.cyan(file.relativePath)}`)
      }

      this.log('')
    }

    if (unsynced.length > 0) {
      this.log(chalk.bold('○ Unsynced (local files not in iCloud):'))
      for (const file of unsynced) {
        this.log(`  ${chalk.yellow('●')} ${chalk.cyan(file.relativePath)}`)
      }

      this.log('')
    }

    if (regularFiles.length > 0) {
      this.log(chalk.bold('◐ Regular files (also in iCloud, same content):'))
      for (const file of regularFiles) {
        this.log(`  ${chalk.blue('●')} ${chalk.cyan(file.relativePath)}`)
      }

      this.log('')
    }

    if (conflicts.length > 0) {
      this.log(chalk.bold('! Conflicts (local differs from iCloud):'))
      for (const file of conflicts) {
        this.log(`  ${chalk.red('●')} ${chalk.cyan(file.relativePath)}`)
      }

      this.log('')
    }

    if (orphaned.length > 0) {
      this.log(chalk.bold('? Orphaned (in iCloud, no symlink locally):'))
      for (const file of orphaned) {
        this.log(`  ${chalk.dim('●')} ${chalk.dim(file.relativePath)}`)
      }

      this.log('')
    }

    // Summary
    this.log(chalk.bold('Summary:'))
    this.log(`  ${chalk.green('Synced:')} ${synced.length}`)
    if (unsynced.length > 0) {
      this.log(`  ${chalk.yellow('Unsynced:')} ${unsynced.length}`)
    }

    if (regularFiles.length > 0) {
      this.log(`  ${chalk.blue('Regular files:')} ${regularFiles.length}`)
    }

    if (conflicts.length > 0) {
      this.log(`  ${chalk.red('Conflicts:')} ${conflicts.length}`)
    }

    if (orphaned.length > 0) {
      this.log(`  ${chalk.dim('Orphaned:')} ${orphaned.length}`)
    }

    const needsSync = unsynced.length + regularFiles.length + conflicts.length + orphaned.length
    if (needsSync > 0) {
      this.log('')
      this.log(chalk.dim("Run 'dotsloth env sync' to sync files"))
      if (conflicts.length > 0) {
        this.log(chalk.dim("Use 'dotsloth env sync --force' to overwrite iCloud on conflicts"))
      }
    }

    this.log('')
  }
}
