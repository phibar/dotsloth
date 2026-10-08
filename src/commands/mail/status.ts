import chalk from 'chalk'
import {BaseCommand} from '../../cli/base-command.js'
import {getMailStatus} from '../../core/mail.js'

export default class MailStatus extends BaseCommand {
  static override description = 'Compare Mail on this machine with what is in the dotsloth store'
  static override examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    this.log(chalk.bold('\n🦥 mail status\n'))

    const status = getMailStatus()
    this.log(chalk.dim(`Store: ${status.store}`))

    if (!status.exported) {
      this.log('')
      this.log(chalk.yellow('Nothing exported yet') + chalk.dim(' — run "dotsloth mail export"'))
      this.log('')
      return
    }

    const stored = status.exported.counts
    if (!status.local) {
      this.log('')
      this.log(
        chalk.dim(
          `Mail.app not present. Store holds ${stored.accounts} account(s), ` +
            `${stored.rules} rule(s), ${stored.signatures} signature(s).`,
        ),
      )
      this.log('')
      return
    }

    const row = (label: string, liveCount: number, storeCount: number) => {
      const mark = liveCount === storeCount ? chalk.green('✓') : chalk.yellow('!')
      this.log(
        `  ${mark} ${label.padEnd(12)} local ${String(liveCount).padStart(3)}   store ${String(storeCount).padStart(3)}`,
      )
    }

    this.log('')
    this.log(chalk.dim(`Exported ${status.exported.exportedAt}`))
    row('accounts', status.local.accounts, stored.accounts)
    row('rules', status.local.rules, stored.rules)
    row('signatures', status.local.signatures, stored.signatures)

    if (status.missingAccounts.length > 0) {
      this.log('')
      this.log(chalk.yellow(`${status.missingAccounts.length} account(s) in the store are not configured here:`))
      for (const a of status.missingAccounts) this.log(chalk.dim(`    ${a.name} (${a.user})`))
      this.log(chalk.dim('    → dotsloth mail restore'))
    }

    this.log('')
  }
}
