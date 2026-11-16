/*
 * Purpose: CLI command that shows the recent output of a self-hosted runner.
 * Intention: realizes BaseCommand; uses runnerLogs from core/runners and runnerArgs from cli/runner.
 */

import {Flags} from '@oclif/core'
import chalk from 'chalk'

import {BaseCommand} from '../../cli/base-command.js'
import {runnerArgs} from '../../cli/runner.js'
import {DEFAULT_LOG_LINES, runnerLogs} from '../../core/runners.js'

export default class RunnerLogs extends BaseCommand {
  static override args = runnerArgs
  static override description = "Show the last lines of a runner's service log"
  static override examples = [
    '<%= config.bin %> <%= command.id %> metatrom-ag',
    '<%= config.bin %> <%= command.id %> metatrom-ag -n 50',
  ]
  static override flags = {
    lines: Flags.integer({char: 'n', default: DEFAULT_LOG_LINES, description: 'Number of lines'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(RunnerLogs)
    const logs = runnerLogs({...args, lines: flags.lines})
    if (logs.logPath) this.log(chalk.dim(logs.logPath))
    if (logs.lines.length === 0) this.log(chalk.dim('(no output yet)'))
    for (const line of logs.lines) this.log(line)
  }
}
