import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {loadConfig} from '../../lib/config.js'
import {compare, copyToStore, DEFAULT_ENV_PATTERNS, scanAll} from '../../lib/env.js'
import {PATHS} from '../../lib/paths.js'

export default class EnvPush extends Command {
  static override description = 'Copy env files from your repos into the dotsloth store'
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --dry-run']
  static override flags = {
    'dry-run': Flags.boolean({description: 'Show what would be copied without writing'}),
    force: Flags.boolean({char: 'f', description: 'Overwrite store entries that differ'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(EnvPush)
    const config = loadConfig()
    const githubRoot = config?.paths.githubRoot ?? PATHS.githubRoot

    const entries = scanAll(githubRoot, DEFAULT_ENV_PATTERNS).map((f) => compare(f))
    let copied = 0
    let skipped = 0

    this.log(chalk.bold('\n🦥 env push\n'))

    for (const entry of entries) {
      const label = `${entry.file.org}/${entry.file.repo}/${entry.file.relativePath}`

      if (entry.state === 'identical' || entry.state === 'store-only') continue

      // A store copy that differs may be newer work from the other machine.
      // Overwriting it blind is how you lose the thing you were protecting.
      if (entry.state === 'differs' && !flags.force) {
        this.log(chalk.yellow('!') + ` ${label} ${chalk.dim('differs from store — use --force to overwrite')}`)
        skipped++
        continue
      }

      if (flags['dry-run']) {
        this.log(chalk.dim(`  would copy ${label}`))
        copied++
        continue
      }

      copyToStore(entry.file)
      this.log(chalk.green('✓') + ` ${label}`)
      copied++
    }

    this.log('')
    this.log(`${copied} copied, ${skipped} skipped`)
    if (skipped > 0) {
      this.log(chalk.yellow('Resolve conflicts by hand, or re-run with --force'))
    }

    this.log(chalk.dim(`Store: ${PATHS.icloudEnvs}`))
    this.log('')
  }
}
