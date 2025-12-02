import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {loadConfig} from '../../lib/config.js'
import {scanForEnvFiles} from '../../lib/env.js'

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
    const githubRoot = config?.paths.githubRoot

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
      const status = envFile.backedUp ? chalk.green('✓ backed up') : chalk.yellow('○ not backed up')
      this.log(`  ${chalk.cyan(envFile.relativePath)} ${status}`)
    }

    const notBackedUp = envFiles.filter((f) => !f.backedUp)
    if (notBackedUp.length > 0) {
      this.log('')
      this.log(chalk.dim(`Run 'dotsloth env backup' to backup ${notBackedUp.length} file(s) to iCloud`))
    }

    this.log('')
  }
}
