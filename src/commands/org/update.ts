import {Args, Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import Enquirer from 'enquirer'

import {addOrganization, loadConfig} from '../../lib/config.js'
import type {Organization} from '../../types/index.js'

export default class OrgUpdate extends Command {
  static override args = {
    name: Args.string({description: 'Organization name to update'}),
  }

  static override description = 'Update an organization configuration'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> ExRam',
    '<%= config.bin %> <%= command.id %> ExRam --email new@email.com',
  ]

  static override flags = {
    email: Flags.string({char: 'e', description: 'New git email'}),
    username: Flags.string({char: 'u', description: 'New git username'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(OrgUpdate)

    const config = loadConfig(false) // Don't auto-sync yet
    if (!config || config.organizations.length === 0) {
      this.error('No organizations configured. Run "dotsloth org add" first.')
    }

    // Select organization
    let orgName = args.name
    if (!orgName) {
      const {selectedOrg} = await Enquirer.prompt<{selectedOrg: string}>({
        type: 'select',
        name: 'selectedOrg',
        message: 'Select organization to update:',
        choices: config.organizations.map((o) => ({
          name: o.name,
          message: `${o.name} (${o.gitEmail})`,
        })),
      })
      orgName = selectedOrg
    }

    // Find organization
    const org = config.organizations.find((o) => o.name.toLowerCase() === orgName!.toLowerCase())
    if (!org) {
      this.error(`Organization '${orgName}' not found`)
    }

    this.log('')
    this.log(chalk.bold(`Updating ${org.name}:`))
    this.log(chalk.dim(`  Current email:    ${org.gitEmail}`))
    this.log(chalk.dim(`  Current username: ${org.gitUsername}`))
    this.log('')

    // Get new email
    let newEmail = flags.email
    if (!newEmail) {
      const response = await Enquirer.prompt<{email: string}>({
        type: 'input',
        name: 'email',
        message: 'Git email:',
        initial: org.gitEmail,
        validate: (input) => {
          if (input.length === 0) return 'Email is required'
          if (!input.includes('@')) return 'Invalid email format'
          return true
        },
      })
      newEmail = response.email
    }

    // Get new username
    let newUsername = flags.username
    if (!newUsername) {
      const response = await Enquirer.prompt<{username: string}>({
        type: 'input',
        name: 'username',
        message: 'Git username:',
        initial: org.gitUsername,
        validate: (input) => (input.length > 0 ? true : 'Username is required'),
      })
      newUsername = response.username
    }

    // Check if anything changed
    if (newEmail === org.gitEmail && newUsername === org.gitUsername) {
      this.log(chalk.yellow('No changes made'))
      return
    }

    // Update organization
    const updatedOrg: Organization = {
      ...org,
      gitEmail: newEmail,
      gitUsername: newUsername,
    }

    addOrganization(updatedOrg) // This saves and auto-syncs gitconfig

    this.log('')
    this.log(chalk.green(`✓ Organization '${org.name}' updated`))
    if (newEmail !== org.gitEmail) {
      this.log(chalk.dim(`  Email: ${org.gitEmail} → ${newEmail}`))
    }
    if (newUsername !== org.gitUsername) {
      this.log(chalk.dim(`  Username: ${org.gitUsername} → ${newUsername}`))
    }
  }
}
