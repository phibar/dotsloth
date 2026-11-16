/*
 * Purpose: CLI command that shows the self-hosted runners this Mac runs and their state.
 * Intention: realizes BaseCommand; uses listRunners from core/runners and printRunner from cli/runner.
 */

import {Flags} from '@oclif/core'
import chalk from 'chalk'

import {BaseCommand} from '../../cli/base-command.js'
import {printRunner} from '../../cli/runner.js'
import {listRunners} from '../../core/runners.js'

export default class RunnerList extends BaseCommand {
  static override description = 'List the self-hosted runners on this Mac, with launchd and GitHub state'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --org metatrom-ag',
  ]
  static override flags = {
    offline: Flags.boolean({description: 'Skip asking GitHub for online and busy state'}),
    org: Flags.string({description: 'Only this organization'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(RunnerList)
    const log = this.log.bind(this)

    const {runners, warnings} = await listRunners({offline: flags.offline, org: flags.org})
    this.log('')
    if (runners.length === 0) this.log(chalk.dim('No runners on this Mac — add one with "dotsloth runner add <org>"'))
    for (const runner of runners) printRunner(log, runner)
    for (const warning of warnings) this.log(chalk.yellow('!') + ` ${warning}`)
    this.log('')
  }
}
