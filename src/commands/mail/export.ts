import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {MAIL_STORE, mailInstalled, readAccounts, readRules, readSignatures, writeExport} from '../../lib/mail.js'

export default class MailExport extends Command {
  static override description = 'Export Mail accounts, rules and signatures to the dotsloth store'
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --dry-run']
  static override flags = {
    'dry-run': Flags.boolean({description: 'Show what would be exported without writing'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(MailExport)

    if (!mailInstalled()) {
      this.error('Mail.app not found on this machine.')
    }

    this.log(chalk.bold('\n🦥 mail export\n'))

    let accounts
    let rules
    let signatures
    try {
      // Mail's own data lives under ~/Library/Mail and ~/Library/Accounts,
      // both of which are TCC-protected and unreadable without Full Disk
      // Access. Mail's scripting interface exposes the same settings and only
      // needs Automation permission, which macOS prompts for once.
      accounts = readAccounts()
      rules = readRules()
      signatures = readSignatures()
    } catch (error) {
      this.error(
        `Could not read from Mail: ${error instanceof Error ? error.message : String(error)}\n` +
          'If macOS asked for permission to control Mail, allow it and run this again.',
      )
    }

    this.log(`${chalk.green('✓')} ${accounts.length} account(s)`)
    for (const a of accounts) {
      const aliases = a.emails.length > 1 ? chalk.dim(` +${a.emails.length - 1} alias(es)`) : ''
      this.log(chalk.dim(`    ${a.name} — ${a.type}${aliases}`))
    }

    const conditionCount = rules.reduce((n, r) => n + r.conditions.length, 0)
    this.log(`${chalk.green('✓')} ${rules.length} rule(s), ${conditionCount} condition(s)`)
    this.log(`${chalk.green('✓')} ${signatures.length} signature(s)`)

    if (flags['dry-run']) {
      this.log('')
      this.log(chalk.yellow('Dry run — nothing written.'))
      return
    }

    writeExport({accounts, exportedAt: new Date().toISOString(), rules, signatures})

    this.log('')
    this.log(chalk.dim(`Store: ${MAIL_STORE}`))
    this.log('')
  }
}
