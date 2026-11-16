/*
 * Purpose: CLI command that stops a self-hosted runner's launchd service.
 * Intention: realizes BaseCommand; uses stopRunner from core/runners and runnerArgs, printRunner from cli/runner.
 */

import {BaseCommand} from '../../cli/base-command.js'
import {printRunner, runnerArgs} from '../../cli/runner.js'
import {stopRunner} from '../../core/runners.js'

export default class RunnerStop extends BaseCommand {
  static override args = runnerArgs
  static override description = "Stop a runner's launchd service; GitHub shows it offline"
  static override examples = ['<%= config.bin %> <%= command.id %> metatrom-ag']

  public async run(): Promise<void> {
    const {args} = await this.parse(RunnerStop)
    printRunner(this.log.bind(this), await stopRunner(args))
  }
}
