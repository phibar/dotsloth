import {Args, Flags} from '@oclif/core'
import chalk from 'chalk'
import {BaseCommand} from '../../cli/base-command.js'
import {applyMemorySync, type MemoryFilePlan, planMemorySync} from '../../core/claude.js'

export default class ClaudeMemory extends BaseCommand {
  static override args = {
    direction: Args.string({
      default: 'status',
      description: 'status | push | pull',
      options: ['status', 'push', 'pull'],
    }),
  }
  static override description = 'Share Claude Code project memory between machines'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> push',
    '<%= config.bin %> <%= command.id %> pull',
  ]
  static override flags = {
    'dry-run': Flags.boolean({description: 'Show what would change without writing'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(ClaudeMemory)
    const direction = args.direction as 'pull' | 'push' | 'status'
    const applying = direction !== 'status' && !flags['dry-run']

    const plan = direction !== 'status' && applying ? applyMemorySync(direction) : planMemorySync(direction)

    this.log(chalk.bold(`\n🦥 claude memory — ${direction}\n`))
    this.log(chalk.dim(`Store: ${plan.store}`))
    this.log('')

    for (const project of plan.projects) {
      this.log(chalk.bold(project.key))
      for (const file of project.files) {
        this.log(`  ${file.name.padEnd(38)} ${this.outcome(file, direction, applying)}`)
      }
    }

    this.log('')
    this.log(`${plan.changes} file(s) ${direction === 'status' ? 'out of sync' : 'changed'}`)
    if (plan.unkeyed > 0) {
      this.log(chalk.dim(`${plan.unkeyed} project(s) skipped — no git remote to key them by`))
    }

    this.log('')
  }

  private outcome(file: MemoryFilePlan, direction: 'pull' | 'push' | 'status', applying: boolean): string {
    if (direction === 'status') return chalk.yellow(file.state)
    if (file.action === 'nothing-to-copy') return chalk.dim('nothing to copy')
    if (!applying) return chalk.dim(`would ${direction}`)
    if (file.action === 'merge') return chalk.cyan('merged index')
    return chalk.green(direction === 'push' ? 'pushed' : 'pulled')
  }
}
