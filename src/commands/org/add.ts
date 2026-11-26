import {confirm, input} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import chalk from 'chalk'
import {printAutoSync} from '../../cli/autosync.js'
import {BaseCommand} from '../../cli/base-command.js'
import {addOrg, findOrg} from '../../core/orgs.js'

/**
 * Purpose: give a GitHub organisation its git identity.
 *
 * Intention: extends BaseCommand; uses core/orgs and cli/autosync; asks
 * with @inquirer/prompts what the flags leave out.
 */
export default class OrgAdd extends BaseCommand {
  static override args = {
    name: Args.string({description: 'Organization name (e.g., phibar)'}),
  }
  static override description = 'Add a new organization configuration'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> phibar --email you@phibar.work --username phibar',
  ]
  static override flags = {
    email: Flags.string({char: 'e', description: 'Git email for this organization'}),
    username: Flags.string({char: 'u', description: 'Git username for this organization'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(OrgAdd)

    const name =
      args.name ??
      (await input({
        message: 'Organization name (as it appears on GitHub):',
        validate: (value) => (value.length > 0 ? true : 'Name is required'),
      }))

    const existing = findOrg(name)
    if (existing) {
      const confirmed = await confirm({default: false, message: `Organization '${name}' already exists. Update it?`})

      if (!confirmed) {
        this.log(chalk.yellow('Cancelled'))
        return
      }
    }

    const email =
      flags.email ??
      (await input({
        default: existing?.gitEmail,
        message: 'Git email for this organization:',
        validate(value) {
          if (value.length === 0) return 'Email is required'
          if (!value.includes('@')) return 'Invalid email format'
          return true
        },
      }))

    const username =
      flags.username ??
      (await input({
        default: existing?.gitUsername,
        message: 'Git username for this organization:',
        validate: (value) => (value.length > 0 ? true : 'Username is required'),
      }))

    const result = await addOrg({gitEmail: email, gitUsername: username, name}, {overwrite: Boolean(existing)})

    this.log(chalk.dim(`Created git config: ${result.gitconfigPath}`))
    if (result.createdFolder) {
      this.log(chalk.dim(`Created directory: ${result.org.path}`))
    }

    this.log('')
    this.log(chalk.green(`✓ Organization '${name}' configured`))
    this.log(chalk.dim(`  Email: ${email}`))
    this.log(chalk.dim(`  Username: ${username}`))
    this.log(chalk.dim(`  Path: ${result.org.path}`))
    this.log('')
    printAutoSync(this.log.bind(this), result.sync)
  }
}
