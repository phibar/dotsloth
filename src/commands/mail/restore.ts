import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {
  howToAdd,
  mailInstalled,
  osascript,
  readAccounts,
  readExport,
  readRules,
  readSignatures,
  ruleScript,
  signatureScript,
} from '../../lib/mail.js'

export default class MailRestore extends Command {
  static override description = 'Recreate Mail signatures and rules, and list the accounts to re-add'
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --dry-run']
  static override flags = {
    'accounts-only': Flags.boolean({description: 'Only print the account checklist'}),
    'dry-run': Flags.boolean({description: 'Show what would be recreated without changing Mail'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(MailRestore)

    const stored = readExport()
    if (!stored) {
      this.error('Nothing in the mail store. Run "dotsloth mail export" on the old machine first.')
    }

    this.log(chalk.bold('\n🦥 mail restore\n'))
    this.log(chalk.dim(`Exported ${stored.exportedAt}`))
    this.log('')

    // --- Accounts: a checklist, never automated -------------------------
    // Every account type here is Apple ID or OAuth backed. A configuration
    // profile can only provision plain IMAP/SMTP with a stored password, and
    // macOS 26 removed `profiles install` anyway, so re-adding is manual.
    // Reading accounts changes nothing, so this runs in dry-run too - otherwise
    // every account would be reported missing and the checklist would be wrong.
    const existing = mailInstalled() ? new Set(readAccounts().map((a) => a.name)) : new Set<string>()

    this.log(chalk.bold(`Accounts to re-add (${stored.accounts.length})`))
    for (const [i, a] of stored.accounts.entries()) {
      const done = existing.has(a.name)
      const mark = done ? chalk.green('✓') : chalk.yellow('○')
      this.log(`  ${mark} ${i + 1}. ${chalk.bold(a.name)} ${chalk.dim(`(${a.type})`)}`)
      this.log(chalk.dim(`       sign in as  ${a.user}`))
      if (a.emails.length > 1) {
        this.log(chalk.dim(`       aliases     ${a.emails.slice(1).join(', ')}`))
      }

      if (!done) this.log(chalk.dim(`       → ${howToAdd(a)}`))
    }

    if (flags['accounts-only']) {
      this.log('')
      return
    }

    // --- Signatures and rules: these can be recreated --------------------
    const liveSignatures = mailInstalled() ? new Set(readSignatures().map((s) => s.name)) : new Set<string>()
    const liveRules = mailInstalled() ? readRules() : []
    const liveRuleNames = new Set(liveRules.map((r) => r.name))

    this.log('')
    this.log(chalk.bold('Signatures'))
    for (const sig of stored.signatures) {
      if (liveSignatures.has(sig.name)) {
        this.log(chalk.dim(`  = ${sig.name} (already present)`))
        continue
      }

      if (flags['dry-run']) {
        this.log(chalk.dim(`  + would create ${sig.name}`))
        continue
      }

      osascript(signatureScript(sig))
      this.log(`  ${chalk.green('+')} ${sig.name}`)
    }

    this.log('')
    this.log(chalk.bold('Rules'))
    for (const rule of stored.rules) {
      if (liveRuleNames.has(rule.name)) {
        this.log(chalk.dim(`  = ${rule.name} (already present)`))
        continue
      }

      // A move action points at a mailbox by name. Recreating the rule before
      // that mailbox exists would silently drop the action, so say so rather
      // than produce a rule that looks right and does nothing.
      if (rule.moveTo) {
        this.log(
          chalk.yellow(`  ! ${rule.name}`) +
            chalk.dim(` — moves mail to "${rule.moveTo}"; create that mailbox first, then re-run`),
        )
        continue
      }

      if (flags['dry-run']) {
        this.log(chalk.dim(`  + would create ${rule.name} (${rule.conditions.length} condition(s))`))
        continue
      }

      osascript(ruleScript(rule))
      this.log(`  ${chalk.green('+')} ${rule.name} ${chalk.dim(`(${rule.conditions.length} condition(s))`)}`)
    }

    this.log('')
    if (flags['dry-run']) this.log(chalk.yellow('Dry run — Mail was not changed.'))
    this.log('')
  }
}
