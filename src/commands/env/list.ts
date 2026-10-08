import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {loadConfig} from '../../lib/config.js'
import {compare, DEFAULT_ENV_PATTERNS, scanAll} from '../../lib/env.js'
import {PATHS} from '../../lib/paths.js'

const STATE_LABEL = {
  differs: chalk.yellow('differs'),
  identical: chalk.green('in sync'),
  'local-only': chalk.red('not backed up'),
  'store-only': chalk.cyan('store only'),
} as const

export default class EnvList extends Command {
  static override description = 'List env files found in your repos and whether they are backed up'
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --unsaved']
  static override flags = {
    unsaved: Flags.boolean({description: 'Only show files that are not yet backed up'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(EnvList)
    const config = loadConfig()
    const githubRoot = config?.paths.githubRoot ?? PATHS.githubRoot

    const entries = scanAll(githubRoot, DEFAULT_ENV_PATTERNS).map((f) => compare(f))
    const shown = flags.unsaved ? entries.filter((e) => e.state !== 'identical') : entries

    if (shown.length === 0) {
      this.log(chalk.dim('No env files found.'))
      return
    }

    this.log(chalk.bold(`\n🦥 env files under ${githubRoot}\n`))
    let lastRepo = ''
    for (const entry of shown) {
      const repoKey = `${entry.file.org}/${entry.file.repo}`
      if (repoKey !== lastRepo) {
        this.log(chalk.bold(repoKey))
        lastRepo = repoKey
      }

      this.log(`  ${STATE_LABEL[entry.state].padEnd(22)} ${entry.file.relativePath}`)
    }

    const unsaved = entries.filter((e) => e.state === 'local-only').length
    this.log('')
    if (unsaved > 0) {
      this.log(chalk.yellow(`${unsaved} file(s) not backed up — run "dotsloth env push"`))
    } else {
      this.log(chalk.green('All env files are backed up'))
    }

    this.log('')
  }
}
