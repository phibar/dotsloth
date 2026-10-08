import {Flags} from '@oclif/core'
import chalk from 'chalk'
import {BaseCommand} from '../../cli/base-command.js'
import {scanEnv} from '../../core/env.js'

const STATE_LABEL = {
  differs: chalk.yellow('differs'),
  identical: chalk.green('in sync'),
  'local-only': chalk.red('not backed up'),
  'store-only': chalk.cyan('store only'),
}

export default class EnvList extends BaseCommand {
  static override description = 'List env files found in your repos and whether they are backed up'
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --unsaved']
  static override flags = {
    unsaved: Flags.boolean({description: 'Only show files that are not yet backed up'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(EnvList)

    const {entries, githubRoot} = scanEnv()
    const shown = flags.unsaved ? entries.filter((e) => e.state !== 'identical') : entries

    if (shown.length === 0) {
      this.log(chalk.dim('No env files found.'))
      return
    }

    this.log(chalk.bold(`\n🦥 env files under ${githubRoot}\n`))

    let lastRepo = ''
    for (const entry of shown) {
      const repoKey = `${entry.org}/${entry.repo}`
      if (repoKey !== lastRepo) {
        this.log(chalk.bold(repoKey))
        lastRepo = repoKey
      }

      this.log(`  ${STATE_LABEL[entry.state].padEnd(22)} ${entry.relativePath}`)
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
