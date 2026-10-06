import {Args, Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import Enquirer from 'enquirer'
import {execSync} from 'node:child_process'
import * as path from 'node:path'

import type {Organization} from '../types/index.js'

import {addOrganization, getOrganization, loadConfig} from '../lib/config.js'
import {ensureOrgDirectory, parseGitUrl, writeOrgGitconfig} from '../lib/git.js'

export default class Clone extends Command {
  static override args = {
    url: Args.string({description: 'Repository URL to clone', required: true}),
  }
static override description = 'Clone a repository to the correct organization folder'
static override examples = [
    '<%= config.bin %> <%= command.id %> git@github.com:ExRam/SomeRepo.git',
    '<%= config.bin %> <%= command.id %> https://github.com/ipfs/kubo',
    '<%= config.bin %> <%= command.id %> git@github.com:fork/repo.git --org ExRam',
  ]
static override flags = {
    org: Flags.string({char: 'o', description: 'Override organization (use a different org than detected)'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(Clone)

    const config = loadConfig()
    if (!config) {
      this.error('No configuration found. Run "dotsloth init" first.')
    }

    // Parse the URL
    const parsed = parseGitUrl(args.url)
    if (!parsed) {
      this.error(`Could not parse repository URL: ${args.url}`)
    }

    this.log(chalk.dim(`Repository: ${parsed.org}/${parsed.repo} on ${parsed.host}`))

    // Determine organization
    let orgName = flags.org || parsed.org
    let org = getOrganization(orgName)

    // If org not found, prompt to create it
    if (!org) {
      this.log(chalk.yellow(`Organization '${orgName}' not configured`))

      const {action} = await Enquirer.prompt<{action: string}>({
        choices: [
          {message: `Create '${orgName}' organization`, name: 'create'},
          {message: 'Select existing organization', name: 'select'},
          {message: 'Clone without organization config', name: 'skip'},
        ],
        message: 'What would you like to do?',
        name: 'action',
        type: 'select',
      })

      if (action === 'create') {
        // Prompt for org details
        const {email} = await Enquirer.prompt<{email: string}>({
          message: 'Git email for this organization:',
          name: 'email',
          type: 'input',
          validate: (input) => (input.includes('@') ? true : 'Invalid email'),
        })

        const {username} = await Enquirer.prompt<{username: string}>({
          message: 'Git username for this organization:',
          name: 'username',
          type: 'input',
          validate: (input) => (input.length > 0 ? true : 'Username required'),
        })

        const newOrg: Organization = {
          folderName: orgName,
          gitEmail: email,
          gitUsername: username,
          name: orgName,
        }

        addOrganization(newOrg)
        writeOrgGitconfig(newOrg)
        org = newOrg

        this.log(chalk.green('✓') + ` Created organization '${orgName}'`)
      } else if (action === 'select') {
        if (config.organizations.length === 0) {
          this.error('No organizations configured. Run "dotsloth org add" first.')
        }

        const {selectedOrg} = await Enquirer.prompt<{selectedOrg: string}>({
          choices: config.organizations.map((o) => ({message: `${o.name} (${o.gitEmail})`, name: o.name})),
          message: 'Select organization:',
          name: 'selectedOrg',
          type: 'select',
        })

        org = getOrganization(selectedOrg)
        if (org) {
          orgName = org.folderName
        }
      } else {
        // Skip org config - use parsed org name for folder
        orgName = parsed.org
      }
    }

    // Ensure org directory exists
    const orgPath = ensureOrgDirectory(orgName, config.paths.githubRoot)
    const repoPath = path.join(orgPath, parsed.repo)

    this.log('')
    this.log(chalk.bold('Cloning...'))
    this.log(chalk.dim(`  From: ${args.url}`))
    this.log(chalk.dim(`  To:   ${repoPath}`))
    this.log('')

    // Clone the repository
    try {
      execSync(`git clone "${args.url}" "${repoPath}"`, {
        stdio: 'inherit',
      })
    } catch {
      this.error('Git clone failed')
    }

    this.log('')
    this.log(chalk.bold.green('✓ Repository cloned successfully'))

    if (org) {
      this.log(chalk.dim(`  Organization: ${org.name}`))
      this.log(chalk.dim(`  Git identity: ${org.gitUsername} <${org.gitEmail}>`))
    }

    this.log(chalk.dim(`  Location: ${repoPath}`))
    this.log('')
  }
}
