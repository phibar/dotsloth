import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import * as fs from 'node:fs'

import {loadConfig} from '../../lib/config.js'
import {getEnvFilesStatus, listBackedUpEnvFiles} from '../../lib/env.js'
import {PATHS} from '../../lib/paths.js'

export default class EnvStatus extends Command {
  static override description = 'Show status of .env files (synced/out-of-sync)'
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
    const githubRoot = config?.paths.githubRoot

    const envFilesStatus = getEnvFilesStatus(githubRoot)
    const backedUpFiles = listBackedUpEnvFiles()

    // Find files that are only in backup (deleted locally)
    const localPaths = new Set(envFilesStatus.map((f) => f.relativePath))
    const orphanedBackups = backedUpFiles.filter((f) => !localPaths.has(f.relativePath))

    if (flags.json) {
      this.log(
        JSON.stringify(
          {
            envFiles: envFilesStatus,
            orphanedBackups,
          },
          null,
          2,
        ),
      )
      return
    }

    this.log(chalk.bold('\n🦥 dotsloth env status\n'))

    // Check if iCloud env files directory exists
    if (!fs.existsSync(PATHS.icloudEnvFiles)) {
      this.log(chalk.dim('iCloud env files directory not yet created'))
      this.log(chalk.dim("Run 'dotsloth env backup' to start backing up .env files\n"))
    }

    if (envFilesStatus.length === 0 && orphanedBackups.length === 0) {
      this.log(chalk.yellow('No .env files found'))
      this.log(chalk.dim(`Searched in: ${githubRoot}`))
      return
    }

    if (envFilesStatus.length > 0) {
      this.log(chalk.bold('Local .env files:'))
      for (const envFile of envFilesStatus) {
        let status: string
        if (!envFile.backedUp) {
          status = chalk.yellow('○ not backed up')
        } else if (envFile.synced) {
          status = chalk.green('✓ synced')
        } else {
          status = chalk.red('! out of sync')
        }

        this.log(`  ${chalk.cyan(envFile.relativePath)} ${status}`)
      }

      const notBackedUp = envFilesStatus.filter((f) => !f.backedUp)
      const outOfSync = envFilesStatus.filter((f) => f.backedUp && !f.synced)

      if (notBackedUp.length > 0 || outOfSync.length > 0) {
        this.log('')
        if (notBackedUp.length > 0) {
          this.log(chalk.dim(`  ${notBackedUp.length} file(s) not backed up`))
        }

        if (outOfSync.length > 0) {
          this.log(chalk.dim(`  ${outOfSync.length} file(s) out of sync`))
        }

        this.log(chalk.dim("  Run 'dotsloth env backup' to sync changes to iCloud"))
      }
    }

    if (orphanedBackups.length > 0) {
      this.log('')
      this.log(chalk.bold('Backed up files (project not found locally):'))
      for (const envFile of orphanedBackups) {
        this.log(`  ${chalk.dim(envFile.relativePath)} ${chalk.yellow('! orphaned')}`)
      }

      this.log('')
      this.log(chalk.dim("  These files exist in iCloud but the projects weren't found locally"))
      this.log(chalk.dim("  Run 'dotsloth env restore' to restore them if the projects exist"))
    }

    this.log('')
  }
}
