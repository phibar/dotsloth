import {Flags} from '@oclif/core'
import chalk from 'chalk'
import {BaseCommand} from '../../cli/base-command.js'
import {printLinkResult} from '../../cli/format.js'
import {linkClaude} from '../../core/claude.js'
import {getConfig} from '../../core/config.js'

export default class ClaudeLink extends BaseCommand {
  static override description = 'Share Claude Code settings between machines via the dotsloth store'
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --dry-run']
  static override flags = {
    'dry-run': Flags.boolean({description: 'Show what would change without writing'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(ClaudeLink)

    getConfig() // fail before printing anything when there is no config
    this.log(chalk.bold('\n🦥 claude settings\n'))

    await linkClaude({dryRun: flags['dry-run']}, (event) => {
      if (event.type === 'seeded') this.log(chalk.dim(`  seeded store from local ${event.name}`))
      else if (event.type === 'skipped') {
        this.log(chalk.dim(`  skip ${event.name} — not present on this machine or in the store`))
      } else if (event.type === 'would-link')
        this.log(chalk.dim(`  would link ${event.localPath} → ${event.storePath}`))
      else printLinkResult(this.log.bind(this), event.name, event.result)
    })

    this.log('')
    this.log(chalk.dim('History and memory are handled separately — they must not be symlinked.'))
    this.log('')
  }
}
