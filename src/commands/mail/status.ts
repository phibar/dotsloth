import {Command} from '@oclif/core'
import chalk from 'chalk'

import {MAIL_STORE, mailInstalled, readAccounts, readExport, readRules, readSignatures} from '../../lib/mail.js'

export default class MailStatus extends Command {
  static override description = 'Compare Mail on this machine with what is in the dotsloth store'
  static override examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    this.log(chalk.bold('\n🦥 mail status\n'))
    this.log(chalk.dim(`Store: ${MAIL_STORE}`))

    const stored = readExport()
    if (!stored) {
      this.log('')
      this.log(chalk.yellow('Nothing exported yet') + chalk.dim(' — run "dotsloth mail export"'))
      this.log('')
      return
    }

    if (!mailInstalled()) {
      this.log('')
      this.log(
        chalk.dim(
          `Mail.app not present. Store holds ${stored.accounts.length} account(s), ` +
            `${stored.rules.length} rule(s), ${stored.signatures.length} signature(s).`,
        ),
      )
      this.log('')
      return
    }

    const live = {
      accounts: readAccounts(),
      rules: readRules(),
      signatures: readSignatures(),
    }

    const row = (label: string, liveCount: number, storeCount: number) => {
      const mark = liveCount === storeCount ? chalk.green('✓') : chalk.yellow('!')
      this.log(
        `  ${mark} ${label.padEnd(12)} local ${String(liveCount).padStart(3)}   store ${String(storeCount).padStart(3)}`,
      )
    }

    this.log('')
    this.log(chalk.dim(`Exported ${stored.exportedAt}`))
    row('accounts', live.accounts.length, stored.accounts.length)
    row('rules', live.rules.length, stored.rules.length)
    row('signatures', live.signatures.length, stored.signatures.length)

    const missing = stored.accounts.filter((a) => !live.accounts.some((l) => l.name === a.name))
    if (missing.length > 0) {
      this.log('')
      this.log(chalk.yellow(`${missing.length} account(s) in the store are not configured here:`))
      for (const a of missing) this.log(chalk.dim(`    ${a.name} (${a.user})`))
      this.log(chalk.dim('    → dotsloth mail restore'))
    }

    this.log('')
  }
}
