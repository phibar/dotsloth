import {confirm, input} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import chalk from 'chalk'
import {BaseCommand} from '../cli/base-command.js'
import {printStepEvent} from '../cli/format.js'
import {getInitPlan, runInit} from '../core/init.js'

/**
 * Purpose: set up dotsloth on a machine, asking only what core leaves to a
 * decision.
 *
 * Intention: extends BaseCommand; uses core/init and cli/format; asks with
 * @inquirer/prompts.
 */
export default class Init extends BaseCommand {
  static override description = 'Initialize dotsloth on this machine'
  static override examples = ['<%= config.bin %> <%= command.id %>']
  static override flags = {
    force: Flags.boolean({char: 'f', description: 'Overwrite existing configuration'}),
    'skip-secrets': Flags.boolean({description: 'Skip secrets extraction from zprofile'}),
    'skip-ssh': Flags.boolean({description: 'Skip SSH keychain setup'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Init)

    this.log(chalk.bold('\n🦥 dotsloth init\n'))

    // Ask everything up front, then run without interruption.
    const plan = getInitPlan({force: flags.force})

    const userName = plan.needsUserName
      ? await input({
          message: 'Your name (for git commits):',
          validate: (value) => (value.length > 0 ? true : 'Name is required'),
        })
      : undefined

    let extractSecrets = false
    if (!flags['skip-secrets'] && plan.secretsInZprofile > 0) {
      this.log(chalk.yellow(`Found ${plan.secretsInZprofile} secret(s) in your .zprofile`))
      extractSecrets = await confirm({default: true, message: 'Extract secrets to iCloud Keychain?'})
      this.log('')
    }

    await runInit({addSshKey: !flags['skip-ssh'], extractSecrets, force: flags.force, userName}, (event) =>
      printStepEvent(this.log.bind(this), event),
    )

    this.log('')
    this.log(chalk.bold.green('🦥 dotsloth initialized!'))
    this.log('')
    this.log(chalk.dim('Next steps:'))
    this.log(chalk.dim('  1. Add organizations: dotsloth org add'))
    this.log(chalk.dim('  2. Clone repos:       dotsloth clone <url>'))
    this.log(chalk.dim('  3. Check status:      dotsloth status'))
    this.log('')
  }
}
