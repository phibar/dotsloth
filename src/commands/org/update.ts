import {input, select} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import chalk from 'chalk'
import {printAutoSync} from '../../cli/autosync.js'
import {BaseCommand} from '../../cli/base-command.js'
import {getConfig} from '../../core/config.js'
import {getOrg, updateOrg} from '../../core/orgs.js'

/**
 * Purpose: change an organisation's git identity.
 *
 * Intention: extends BaseCommand; uses core/orgs, core/config and
 * cli/autosync; asks with @inquirer/prompts.
 */
export default class OrgUpdate extends BaseCommand {
  static override args = {
    name: Args.string({description: 'Organization name to update'}),
  }
  static override description = 'Update an organization configuration'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> phibar',
    '<%= config.bin %> <%= command.id %> phibar --email new@email.com',
  ]
  static override flags = {
    email: Flags.string({char: 'e', description: 'New git email'}),
    username: Flags.string({char: 'u', description: 'New git username'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(OrgUpdate)

    const config = getConfig()
    if (config.organizations.length === 0) {
      this.error('No organizations configured. Run "dotsloth org add" first.')
    }

    const orgName =
      args.name ??
      (await select({
        choices: config.organizations.map((o) => ({name: `${o.name} (${o.gitEmail})`, value: o.name})),
        message: 'Select organization to update:',
      }))

    const org = getOrg(orgName, config)

    this.log('')
    this.log(chalk.bold(`Updating ${org.name}:`))
    this.log(chalk.dim(`  Current email:    ${org.gitEmail}`))
    this.log(chalk.dim(`  Current username: ${org.gitUsername}`))
    this.log('')

    const gitEmail =
      flags.email ??
      (await input({
        default: org.gitEmail,
        message: 'Git email:',
        validate(value) {
          if (value.length === 0) return 'Email is required'
          if (!value.includes('@')) return 'Invalid email format'
          return true
        },
      }))

    const gitUsername =
      flags.username ??
      (await input({
        default: org.gitUsername,
        message: 'Git username:',
        validate: (value) => (value.length > 0 ? true : 'Username is required'),
      }))

    const result = await updateOrg(org.name, {gitEmail, gitUsername})
    if (!result.changed) {
      this.log(chalk.yellow('No changes made'))
      return
    }

    this.log('')
    this.log(chalk.green(`✓ Organization '${org.name}' updated`))
    if (result.after.gitEmail !== result.before.gitEmail) {
      this.log(chalk.dim(`  Email: ${result.before.gitEmail} → ${result.after.gitEmail}`))
    }

    if (result.after.gitUsername !== result.before.gitUsername) {
      this.log(chalk.dim(`  Username: ${result.before.gitUsername} → ${result.after.gitUsername}`))
    }

    this.log('')
    if (result.sync) printAutoSync(this.log.bind(this), result.sync)
  }
}
