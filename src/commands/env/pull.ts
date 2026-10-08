import * as fs from 'node:fs'
import * as path from 'node:path'
import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {loadConfig} from '../../lib/config.js'
import {compare, copyFromStore, scanStore} from '../../lib/env.js'
import {PATHS} from '../../lib/paths.js'

export default class EnvPull extends Command {
  static override description = 'Restore env files from the dotsloth store into your repos'
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --force']
  static override flags = {
    'dry-run': Flags.boolean({description: 'Show what would be restored without writing'}),
    force: Flags.boolean({char: 'f', description: 'Overwrite local files that differ'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(EnvPull)
    const config = loadConfig()
    const githubRoot = config?.paths.githubRoot ?? PATHS.githubRoot

    const stored = scanStore(githubRoot)
    if (stored.length === 0) {
      this.log(chalk.dim('Store is empty — nothing to restore.'))
      return
    }

    this.log(chalk.bold('\n🦥 env pull\n'))
    let restored = 0
    let skipped = 0

    for (const file of stored) {
      const label = `${file.org}/${file.repo}/${file.relativePath}`
      const repoRoot = path.join(githubRoot, file.org, file.repo)

      // Restoring into a repo that isn't cloned yet would scatter stray files
      // across an empty tree, so wait for the clone instead.
      if (!fs.existsSync(repoRoot)) {
        this.log(chalk.dim(`  skip ${label} — repo not cloned`))
        skipped++
        continue
      }

      const entry = compare(file)
      if (entry.state === 'identical') continue
      if (entry.state === 'differs' && !flags.force) {
        this.log(chalk.yellow('!') + ` ${label} ${chalk.dim('local differs — use --force to overwrite')}`)
        skipped++
        continue
      }

      if (flags['dry-run']) {
        this.log(chalk.dim(`  would restore ${label}`))
        restored++
        continue
      }

      copyFromStore(file)
      this.log(chalk.green('✓') + ` ${label}`)
      restored++
    }

    this.log('')
    this.log(`${restored} restored, ${skipped} skipped`)
    this.log('')
  }
}
