import {Flags} from '@oclif/core'
import chalk from 'chalk'
import {BaseCommand} from '../../cli/base-command.js'
import {applyMailRestore, type MailRestorePlan, planMailRestore} from '../../core/mail.js'

export default class MailRestore extends BaseCommand {
  static override description = 'Recreate Mail signatures and rules, and list the accounts to re-add'
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --dry-run']
  static override flags = {
    'accounts-only': Flags.boolean({description: 'Only print the account checklist'}),
    'dry-run': Flags.boolean({description: 'Show what would be recreated without changing Mail'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(MailRestore)

    const plan = planMailRestore()

    this.log(chalk.bold('\n🦥 mail restore\n'))
    this.log(chalk.dim(`Exported ${plan.exportedAt}`))
    this.log('')
    this.printAccounts(plan)

    if (flags['accounts-only']) {
      this.log('')
      return
    }

    const dryRun = flags['dry-run']
    const created = new Set<string>()
    if (!dryRun) {
      applyMailRestore((event) => created.add(`${event.kind}:${event.name}`))
    }

    this.log('')
    this.log(chalk.bold('Signatures'))
    for (const sig of plan.signatures) {
      if (sig.action === 'present') this.log(chalk.dim(`  = ${sig.name} (already present)`))
      else if (dryRun) this.log(chalk.dim(`  + would create ${sig.name}`))
      else if (created.has(`signature:${sig.name}`)) this.log(`  ${chalk.green('+')} ${sig.name}`)
    }

    this.log('')
    this.log(chalk.bold('Rules'))
    for (const rule of plan.rules) {
      const conditions = `(${rule.conditions} condition(s))`
      if (rule.action === 'present') {
        this.log(chalk.dim(`  = ${rule.name} (already present)`))
      } else if (rule.action === 'blocked') {
        this.log(
          chalk.yellow(`  ! ${rule.name}`) +
            chalk.dim(` — moves mail to "${rule.moveTo}"; create that mailbox first, then re-run`),
        )
      } else if (dryRun) {
        this.log(chalk.dim(`  + would create ${rule.name} ${conditions}`))
      } else if (created.has(`rule:${rule.name}`)) {
        this.log(`  ${chalk.green('+')} ${rule.name} ${chalk.dim(conditions)}`)
      }
    }

    this.log('')
    if (dryRun) this.log(chalk.yellow('Dry run — Mail was not changed.'))
    this.log('')
  }

  private printAccounts(plan: MailRestorePlan): void {
    this.log(chalk.bold(`Accounts to re-add (${plan.accounts.length})`))
    for (const [i, {account, howToAdd, present}] of plan.accounts.entries()) {
      const mark = present ? chalk.green('✓') : chalk.yellow('○')
      this.log(`  ${mark} ${i + 1}. ${chalk.bold(account.name)} ${chalk.dim(`(${account.type})`)}`)
      this.log(chalk.dim(`       sign in as  ${account.user}`))
      if (account.emails.length > 1) {
        this.log(chalk.dim(`       aliases     ${account.emails.slice(1).join(', ')}`))
      }

      if (!present) this.log(chalk.dim(`       → ${howToAdd}`))
    }
  }
}
