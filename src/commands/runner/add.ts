/*
 * Purpose: CLI command that sets up a self-hosted runner of an organization on this Mac.
 * Intention: realizes BaseCommand; uses addRunner from core/runners, printStepEvent
 * from cli/format and printRunner from cli/runner.
 */

import {Flags} from '@oclif/core'
import chalk from 'chalk'

import {BaseCommand} from '../../cli/base-command.js'
import {printStepEvent} from '../../cli/format.js'
import {printRunner, runnerArgs} from '../../cli/runner.js'
import {addRunner} from '../../core/runners.js'

export default class RunnerAdd extends BaseCommand {
  static override args = {org: runnerArgs.org}
  static override description =
    'Download, register and start a self-hosted GitHub Actions runner for an organization (needs gh with admin:org)'
  static override examples = [
    '<%= config.bin %> <%= command.id %> metatrom-ag',
    '<%= config.bin %> <%= command.id %> metatrom-ag --labels e2e,macos-build',
  ]
  static override flags = {
    labels: Flags.string({
      description:
        "Extra labels, comma-separated, besides self-hosted, macOS and the architecture; 'desktop' runs the runner in the logged-in desktop's session, as Safari's safaridriver needs",
    }),
    name: Flags.string({description: "Runner name (default: this Mac's host name)"}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(RunnerAdd)
    const log = this.log.bind(this)

    const labels = flags.labels
      ? flags.labels
          .split(',')
          .map((label) => label.trim())
          .filter(Boolean)
      : []
    const runner = await addRunner({labels, name: flags.name, org: args.org}, (event) => printStepEvent(log, event))

    this.log('')
    printRunner(log, runner)
    this.log('')
    this.log(chalk.dim('  Use it in a workflow with: runs-on: self-hosted'))
    this.log('')
  }
}
