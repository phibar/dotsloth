import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {loadConfig} from '../../lib/config.js'
import {linkOrphanedEnvFiles, syncAllEnvFiles} from '../../lib/env.js'
import {PATHS} from '../../lib/paths.js'

export default class EnvSync extends Command {
  static override description =
    'Sync .env files to iCloud (moves files to iCloud and creates symlinks in projects)'
static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --force',
    '<%= config.bin %> <%= command.id %> --dry-run',
  ]
static override flags = {
    'dry-run': Flags.boolean({description: 'Show what would be synced without making changes'}),
    force: Flags.boolean({char: 'f', description: 'Overwrite iCloud files when conflicts occur'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(EnvSync)

    const config = loadConfig()
    const githubRoot = config?.paths.githubRoot ?? PATHS.githubRoot

    this.log(chalk.bold('\n🦥 dotsloth env sync\n'))

    if (flags['dry-run']) {
      this.log(chalk.yellow('Dry run mode - no changes will be made\n'))
    }

    // First, sync local env files to iCloud
    this.log(chalk.bold('Syncing local .env files to iCloud:'))

    if (flags['dry-run']) {
      const {scanForEnvFiles} = await import('../../lib/env.js')
      const envFiles = scanForEnvFiles(githubRoot)

      if (envFiles.length === 0) {
        this.log(chalk.dim('  No .env files found'))
      } else {
        for (const envFile of envFiles) {
          if (envFile.isSymlinked) {
            this.log(chalk.dim(`  ${envFile.relativePath} (already synced)`))
          } else if (envFile.inIcloud) {
            this.log(chalk.yellow(`  ${envFile.relativePath} (conflict - would need --force)`))
          } else {
            this.log(chalk.cyan(`  ${envFile.relativePath} → iCloud`))
          }
        }
      }
    } else {
      const {conflicts, failed, results, synced} = syncAllEnvFiles(githubRoot, flags.force)

      if (results.length === 0) {
        this.log(chalk.dim('  No .env files found'))
      } else {
        for (const result of results) {
          if (result.action === 'skipped' && result.success) {
            this.log(chalk.dim(`  ${result.envFile.relativePath} (already synced)`))
          } else switch (result.action) {
 case 'conflict': {
            this.log(chalk.yellow('!') + ` ${result.envFile.relativePath} (conflict)`)
          
 break;
 }

 case 'created': {
            this.log(chalk.green('✓') + ` ${result.envFile.relativePath} → iCloud`)
          
 break;
 }

 case 'linked': {
            this.log(chalk.green('✓') + ` ${result.envFile.relativePath} (linked)`)
          
 break;
 }

 default: {
            this.log(chalk.red('✗') + ` ${result.envFile.relativePath}: ${result.error}`)
          }
 }
        }

        this.log('')
        if (synced > 0) {
          this.log(chalk.green(`✓ Synced ${synced} file(s) to iCloud`))
        }

        if (conflicts > 0) {
          this.log(chalk.yellow(`! ${conflicts} conflict(s) - use --force to overwrite`))
        }

        if (failed > 0) {
          this.log(chalk.red(`✗ Failed to sync ${failed} file(s)`))
        }
      }
    }

    // Then, link orphaned iCloud files
    this.log('')
    this.log(chalk.bold('Linking orphaned iCloud files:'))

    if (flags['dry-run']) {
      const {listIcloudEnvFiles} = await import('../../lib/env.js')
      const icloudFiles = listIcloudEnvFiles()
      const orphaned = icloudFiles.filter((f) => !f.isSymlinked)

      if (orphaned.length === 0) {
        this.log(chalk.dim('  No orphaned files'))
      } else {
        for (const file of orphaned) {
          this.log(chalk.cyan(`  ${file.relativePath} → project`))
        }
      }
    } else {
      const orphanResults = linkOrphanedEnvFiles()

      if (orphanResults.length === 0) {
        this.log(chalk.dim('  No orphaned files'))
      } else {
        for (const result of orphanResults) {
          if (result.success) {
            this.log(chalk.green('✓') + ` ${result.envFile.relativePath}`)
          } else if (result.action === 'conflict') {
            this.log(chalk.yellow('!') + ` ${result.envFile.relativePath} (local file exists)`)
          } else {
            this.log(chalk.red('✗') + ` ${result.envFile.relativePath}: ${result.error}`)
          }
        }
      }
    }

    this.log('')
    this.log(chalk.bold.green('🦥 Sync complete!'))
    this.log(chalk.dim('  iCloud is the single source of truth'))
    this.log(chalk.dim('  Projects contain symlinks pointing to iCloud'))
    this.log('')
  }
}
