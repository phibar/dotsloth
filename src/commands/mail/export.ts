import {Flags} from '@oclif/core'
import chalk from 'chalk'
import {BaseCommand} from '../../cli/base-command.js'
import {exportMail} from '../../core/mail.js'

export default class MailExport extends BaseCommand {
  static override description = 'Export Mail accounts, rules and signatures to the dotsloth store'
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --dry-run']
  static override flags = {
    'dry-run': Flags.boolean({description: 'Show what would be exported without writing'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(MailExport)

    this.log(chalk.bold('\n🦥 mail export\n'))

    const result = exportMail({dryRun: flags['dry-run']})

    this.log(`${chalk.green('✓')} ${result.accounts.length} account(s)`)
    for (const a of result.accounts) {
      const aliases = a.emails.length > 1 ? chalk.dim(` +${a.emails.length - 1} alias(es)`) : ''
      this.log(chalk.dim(`    ${a.name} — ${a.type}${aliases}`))
    }

    this.log(`${chalk.green('✓')} ${result.ruleCount} rule(s), ${result.conditionCount} condition(s)`)
    this.log(`${chalk.green('✓')} ${result.signatureCount} signature(s)`)

    this.log('')
    if (result.written) {
      this.log(chalk.dim(`Store: ${result.store}`))
      this.log('')
    } else {
      this.log(chalk.yellow('Dry run — nothing written.'))
    }
  }
}
