/*
 * Purpose: CLI command that starts a self-hosted runner's launchd service.
 * Intention: realizes BaseCommand; uses startRunner from core/runners and runnerArgs, printRunner from cli/runner.
 */

import {BaseCommand} from '../../cli/base-command.js'
import {printRunner, runnerArgs} from '../../cli/runner.js'
import {startRunner} from '../../core/runners.js'

export default class RunnerStart extends BaseCommand {
  static override args = runnerArgs
  static override description = "Start a runner's launchd service"
  static override examples = ['<%= config.bin %> <%= command.id %> metatrom-ag']

  public async run(): Promise<void> {
    const {args} = await this.parse(RunnerStart)
    printRunner(this.log.bind(this), await startRunner(args))
  }
}
