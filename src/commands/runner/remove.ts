/*
 * Purpose: CLI command that takes a self-hosted runner off this Mac and off its organization.
 * Intention: realizes BaseCommand; uses removeRunner from core/runners, printStepEvent from
 * cli/format and runnerArgs from cli/runner; asks with enquirer before it removes anything.
 */

import {Flags} from '@oclif/core'
import chalk from 'chalk'
import Enquirer from 'enquirer'

import {BaseCommand} from '../../cli/base-command.js'
import {printStepEvent} from '../../cli/format.js'
import {runnerArgs} from '../../cli/runner.js'
import {removeRunner} from '../../core/runners.js'

export default class RunnerRemove extends BaseCommand {
  static override args = runnerArgs
  static override description =
    'Stop, deregister and delete a runner (its service, its GitHub registration and its folder)'
  static override examples = [
    '<%= config.bin %> <%= command.id %> metatrom-ag',
    '<%= config.bin %> <%= command.id %> metatrom-ag mac-mini --force',
  ]
  static override flags = {
    force: Flags.boolean({char: 'f', description: 'Skip confirmation, and remove locally even when GitHub refuses'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(RunnerRemove)
    const log = this.log.bind(this)

    if (!flags.force) {
      const {confirm} = await Enquirer.prompt<{confirm: boolean}>({
        initial: false,
        message: `Remove runner ${args.name ? `'${args.name}' ` : ''}of '${args.org}' from this Mac and from GitHub?`,
        name: 'confirm',
        type: 'confirm',
      })
      if (!confirm) {
        this.log(chalk.yellow('Cancelled'))
        return
      }
    }

    const result = await removeRunner({...args, force: flags.force}, (event) => printStepEvent(log, event))
    this.log('')
    this.log(chalk.green('✓') + ` Runner '${result.name}' of '${result.org}' removed`)
  }
}
