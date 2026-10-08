import {Args, Flags} from '@oclif/core'
import chalk from 'chalk'
import Enquirer from 'enquirer'
import {printAutoSync} from '../../cli/autosync.js'
import {BaseCommand} from '../../cli/base-command.js'
import {addOrg, findOrg} from '../../core/orgs.js'

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
      (
        await Enquirer.prompt<{name: string}>({
          message: 'Organization name (as it appears on GitHub):',
          name: 'name',
          type: 'input',
          validate: (input) => (input.length > 0 ? true : 'Name is required'),
        })
      ).name

    const existing = findOrg(name)
    if (existing) {
      const {confirm} = await Enquirer.prompt<{confirm: boolean}>({
        initial: false,
        message: `Organization '${name}' already exists. Update it?`,
        name: 'confirm',
        type: 'confirm',
      })

      if (!confirm) {
        this.log(chalk.yellow('Cancelled'))
        return
      }
    }

    const email =
      flags.email ??
      (
        await Enquirer.prompt<{email: string}>({
          initial: existing?.gitEmail,
          message: 'Git email for this organization:',
          name: 'email',
          type: 'input',
          validate(input) {
            if (input.length === 0) return 'Email is required'
            if (!input.includes('@')) return 'Invalid email format'
            return true
          },
        })
      ).email

    const username =
      flags.username ??
      (
        await Enquirer.prompt<{username: string}>({
          initial: existing?.gitUsername,
          message: 'Git username for this organization:',
          name: 'username',
          type: 'input',
          validate: (input) => (input.length > 0 ? true : 'Username is required'),
        })
      ).username

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
