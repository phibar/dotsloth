import * as fs from 'node:fs'

import {Args, Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import Enquirer from 'enquirer'

import {addOrganization, ensureIcloudStructure, loadConfig} from '../../lib/config.js'
import {writeOrgGitconfig} from '../../lib/git.js'
import {getOrgRepoPath} from '../../lib/paths.js'
import type {Organization} from '../../types/index.js'

export default class OrgAdd extends Command {
  static override args = {
    name: Args.string({description: 'Organization name (e.g., ExRam)'}),
  }

  static override description = 'Add a new organization configuration'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> ExRam --email philipp@exram.de --username phibar',
  ]

  static override flags = {
    email: Flags.string({char: 'e', description: 'Git email for this organization'}),
    username: Flags.string({char: 'u', description: 'Git username for this organization'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(OrgAdd)

    // Ensure iCloud structure exists
    ensureIcloudStructure()

    // Get organization name
    let name = args.name
    if (!name) {
      const response = await Enquirer.prompt<{name: string}>({
        type: 'input',
        name: 'name',
        message: 'Organization name (as it appears on GitHub):',
        validate: (input) => (input.length > 0 ? true : 'Name is required'),
      })
      name = response.name
    }

    // Check if org already exists
    const config = loadConfig()
    const existing = config?.organizations.find((o) => o.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      const {confirm} = await Enquirer.prompt<{confirm: boolean}>({
        type: 'confirm',
        name: 'confirm',
        message: `Organization '${name}' already exists. Update it?`,
        initial: false,
      })

      if (!confirm) {
        this.log(chalk.yellow('Cancelled'))
        return
      }
    }

    // Get email
    let email = flags.email
    if (!email) {
      const response = await Enquirer.prompt<{email: string}>({
        type: 'input',
        name: 'email',
        message: 'Git email for this organization:',
        initial: existing?.gitEmail,
        validate: (input) => {
          if (input.length === 0) return 'Email is required'
          if (!input.includes('@')) return 'Invalid email format'
          return true
        },
      })
      email = response.email
    }

    // Get username
    let username = flags.username
    if (!username) {
      const response = await Enquirer.prompt<{username: string}>({
        type: 'input',
        name: 'username',
        message: 'Git username for this organization:',
        initial: existing?.gitUsername,
        validate: (input) => (input.length > 0 ? true : 'Username is required'),
      })
      username = response.username
    }

    // Create organization object
    const org: Organization = {
      name,
      folderName: name, // Keep original case for folder
      gitEmail: email,
      gitUsername: username,
    }

    // Add to config
    addOrganization(org)

    // Create org gitconfig
    const gitconfigPath = writeOrgGitconfig(org)
    this.log(chalk.dim(`Created git config: ${gitconfigPath}`))

    // Create org directory if it doesn't exist
    const orgPath = getOrgRepoPath(org.folderName)
    if (!fs.existsSync(orgPath)) {
      fs.mkdirSync(orgPath, {recursive: true})
      this.log(chalk.dim(`Created directory: ${orgPath}`))
    }

    this.log('')
    this.log(chalk.green(`✓ Organization '${name}' configured`))
    this.log(chalk.dim(`  Email: ${email}`))
    this.log(chalk.dim(`  Username: ${username}`))
    this.log(chalk.dim(`  Path: ${orgPath}`))
    this.log('')
    this.log(chalk.dim('Note: Run "dotsloth init" or "dotsloth sync" to update ~/.gitconfig'))
  }
}
