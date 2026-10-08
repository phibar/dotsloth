import chalk from 'chalk'
import {BaseCommand} from '../../cli/base-command.js'
import {getClaudeStatus} from '../../core/claude.js'

export default class ClaudeStatus extends BaseCommand {
  static override description = 'Show which Claude Code config is shared between machines'
  static override examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    this.log(chalk.bold('\n🦥 claude status\n'))

    const status = getClaudeStatus()
    if (!status.installed) {
      this.log(chalk.yellow('~/.claude not found'))
      return
    }

    this.log(chalk.dim(`Store: ${status.store}`))
    this.log('')

    for (const file of status.files) {
      const name = file.name.padEnd(16)
      if (file.state === 'absent') {
        this.log(chalk.dim(`  ${name} not present`))
      } else if (file.state === 'shared') {
        this.log(chalk.green('  ✓') + ` ${name} shared`)
      } else if (file.state === 'local-only') {
        this.log(chalk.yellow('  !') + ` ${name} local only` + chalk.dim(' — run "dotsloth claude link"'))
      } else {
        this.log(chalk.yellow('  !') + ` ${name} in store, not linked here`)
      }
    }

    this.log('')
  }
}
