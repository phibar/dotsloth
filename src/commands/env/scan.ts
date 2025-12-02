import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {loadConfig} from '../../lib/config.js'
import {scanForEnvFiles} from '../../lib/env.js'
import {PATHS} from '../../lib/paths.js'

export default class EnvScan extends Command {
  static override description = 'Scan github folder for .env files'
static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
  ]
static override flags = {
    json: Flags.boolean({description: 'Output as JSON'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(EnvScan)

    const config = loadConfig()
    const githubRoot = config?.paths.githubRoot ?? PATHS.githubRoot

    const envFiles = scanForEnvFiles(githubRoot)

    if (flags.json) {
      this.log(JSON.stringify(envFiles, null, 2))
      return
    }

    if (envFiles.length === 0) {
      this.log(chalk.yellow('No .env files found in github folder'))
      this.log(chalk.dim(`Searched in: ${githubRoot}`))
      return
    }

    this.log(chalk.bold(`\n🔍 Found ${envFiles.length} .env file(s):\n`))

    for (const envFile of envFiles) {
      let status: string
      if (envFile.isSymlinked) {
        status = chalk.green('✓ synced (symlink)')
      } else if (envFile.inIcloud) {
        status = chalk.yellow('○ in iCloud (not linked)')
      } else {
        status = chalk.red('● not synced')
      }

      this.log(`  ${chalk.cyan(envFile.relativePath)} ${status}`)
    }

    const notSynced = envFiles.filter((f) => !f.isSymlinked)
    if (notSynced.length > 0) {
      this.log('')
      this.log(chalk.dim(`Run 'dotsloth env sync' to sync ${notSynced.length} file(s) to iCloud`))
    }

    this.log('')
  }
}
