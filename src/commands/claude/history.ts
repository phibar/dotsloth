import {Args, Flags} from '@oclif/core'
import chalk from 'chalk'
import {BaseCommand} from '../../cli/base-command.js'
import {
  ACTIVE_SESSION_MINUTES,
  applyHistorySync,
  DEFAULT_RETENTION_DAYS,
  type HistoryPlan,
  planHistorySync,
} from '../../core/claude.js'

export default class ClaudeHistory extends BaseCommand {
  static override args = {
    direction: Args.string({
      default: 'status',
      description: 'status | push | pull',
      options: ['status', 'push', 'pull'],
    }),
  }
  static override description = 'Share Claude Code conversation history between machines'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> push',
    '<%= config.bin %> <%= command.id %> pull --retention 30',
  ]
  static override flags = {
    'dry-run': Flags.boolean({description: 'Show what would change without writing'}),
    retention: Flags.integer({
      default: DEFAULT_RETENTION_DAYS,
      description: 'Only sync sessions touched within this many days',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(ClaudeHistory)
    const direction = args.direction as 'pull' | 'push' | 'status'
    const dryRun = flags['dry-run']
    const options = {retentionDays: flags.retention}

    const plan =
      direction !== 'status' && !dryRun ? applyHistorySync(direction, options) : planHistorySync(direction, options)

    this.log(chalk.bold(`\n🦥 claude history — ${direction}\n`))
    this.log(chalk.dim(`Store: ${plan.store}`))
    this.log('')

    for (const project of plan.projects) {
      this.log(chalk.bold(project.key))
      for (const name of project.files) {
        if (direction === 'status') this.log(chalk.dim(`  ${name}  not in store`))
        else if (dryRun) this.log(chalk.dim(`  would ${direction} ${name}`))
        else this.log(chalk.green('  ✓') + ` ${name}`)
      }
    }

    this.printLog(plan, direction, dryRun)

    this.log('')
    this.log(`${plan.sessionCount} session file(s) ${direction === 'status' ? 'out of sync' : 'copied'}`)
    if (plan.skippedActive > 0) {
      this.log(
        chalk.yellow(`${plan.skippedActive} skipped — modified in the last ${ACTIVE_SESSION_MINUTES}m (still live)`),
      )
    }

    if (plan.skippedOld > 0) {
      this.log(chalk.dim(`${plan.skippedOld} skipped — older than ${plan.retentionDays} days`))
    }

    this.log('')
  }

  private printLog(plan: HistoryPlan, direction: 'pull' | 'push' | 'status', dryRun: boolean): void {
    const {localEntries, mergedEntries, storeEntries} = plan.log
    this.log('')
    this.log(chalk.bold('history.jsonl'))
    if (direction === 'status') {
      this.log(chalk.dim(`  local: ${localEntries} entries, store: ${storeEntries} entries`))
      this.log(chalk.dim(`  merged would be: ${mergedEntries} entries`))
    } else if (dryRun) {
      this.log(chalk.dim(`  would merge ${localEntries} + ${storeEntries} -> ${mergedEntries} entries`))
    } else {
      this.log(chalk.green('  ✓') + ` merged ${localEntries} + ${storeEntries} -> ${mergedEntries}`)
    }
  }
}
