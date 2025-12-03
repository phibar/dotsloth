import {Args, Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import Enquirer from 'enquirer'
import * as fs from 'node:fs'

import {loadConfig, removeOrganization} from '../../lib/config.js'
import {deleteOrgGitconfig} from '../../lib/git.js'
import {getOrgRepoPath} from '../../lib/paths.js'

export default class OrgRemove extends Command {
  static override args = {
    name: Args.string({description: 'Organization name to remove', required: true}),
  }
static override description = 'Remove an organization configuration'
static override examples = ['<%= config.bin %> <%= command.id %> ExRam']
static override flags = {
    'delete-repos': Flags.boolean({description: 'Also delete the repository folder'}),
    force: Flags.boolean({char: 'f', description: 'Skip confirmation'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(OrgRemove)

    const config = loadConfig()
    if (!config) {
      this.error('No configuration found. Run "dotsloth init" first.')
    }

    // Find organization
    const org = config.organizations.find((o) => o.name.toLowerCase() === args.name.toLowerCase())
    if (!org) {
      this.error(`Organization '${args.name}' not found`)
    }

    // Check for repos
    const orgPath = getOrgRepoPath(org.folderName)
    let repoCount = 0
    if (fs.existsSync(orgPath)) {
      try {
        const entries = fs.readdirSync(orgPath, {withFileTypes: true})
        repoCount = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).length
      } catch {
        // Ignore errors
      }
    }

    // Confirm deletion
    if (!flags.force) {
      let message = `Are you sure you want to remove '${org.name}'?`
      if (repoCount > 0) {
        message += ` (${repoCount} repos in ${orgPath})`
      }

      const {confirm} = await Enquirer.prompt<{confirm: boolean}>({
        initial: false,
        message,
        name: 'confirm',
        type: 'confirm',
      })

      if (!confirm) {
        this.log(chalk.yellow('Cancelled'))
        return
      }
    }

    // Delete org gitconfig
    deleteOrgGitconfig(org.name)
    this.log(chalk.dim('Removed organization git config'))

    // Optionally delete repos folder
    if (flags['delete-repos'] && fs.existsSync(orgPath)) {
      if (flags.force) {
        fs.rmSync(orgPath, {force: true, recursive: true})
        this.log(chalk.dim(`Deleted: ${orgPath}`))
      } else {
        const {confirmDelete} = await Enquirer.prompt<{confirmDelete: boolean}>({
          initial: false,
          message: chalk.red(`DELETE ${orgPath} and all ${repoCount} repos? This cannot be undone!`),
          name: 'confirmDelete',
          type: 'confirm',
        })

        if (confirmDelete) {
          fs.rmSync(orgPath, {force: true, recursive: true})
          this.log(chalk.dim(`Deleted: ${orgPath}`))
        }
      }
    }

    // Remove from config
    removeOrganization(org.name)

    this.log('')
    this.log(chalk.green(`✓ Organization '${org.name}' removed`))
    this.log(chalk.dim('Note: Run "dotsloth sync" to update ~/.gitconfig'))
  }
}
