import {Args, Flags} from '@oclif/core'
import chalk from 'chalk'
import Enquirer from 'enquirer'
import {printAutoSync} from '../cli/autosync.js'
import {BaseCommand} from '../cli/base-command.js'
import {type ClonePlan, type CloneTarget, clone, planClone} from '../core/clone.js'

export default class Clone extends BaseCommand {
  static override args = {
    url: Args.string({description: 'Repository URL to clone', required: true}),
  }
  static override description = 'Clone a repository to the correct organization folder'
  static override examples = [
    '<%= config.bin %> <%= command.id %> git@github.com:phibar/some-repo.git',
    '<%= config.bin %> <%= command.id %> https://github.com/ipfs/kubo',
    '<%= config.bin %> <%= command.id %> git@github.com:fork/repo.git --org phibar',
  ]
  static override flags = {
    org: Flags.string({char: 'o', description: 'Override organization (use a different org than detected)'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(Clone)

    const plan = planClone(args.url, {org: flags.org})
    this.log(chalk.dim(`Repository: ${plan.orgName}/${plan.repo} on ${plan.host}`))

    const target = plan.org ? undefined : await this.chooseTarget(plan)

    const result = await clone(args.url, {interactive: true, org: flags.org, target}, (event) => {
      if (event.type === 'org-created') {
        this.log(chalk.green('✓') + ` Created organization '${event.name}'`)
      } else if (event.type === 'cloning') {
        this.log('')
        this.log(chalk.bold('Cloning...'))
        this.log(chalk.dim(`  From: ${event.url}`))
        this.log(chalk.dim(`  To:   ${event.repoPath}`))
        this.log('')
      }
    })

    printAutoSync(this.log.bind(this), result.sync, {quiet: true})
    this.log('')
    this.log(chalk.bold.green('✓ Repository cloned successfully'))
    if (result.org) {
      this.log(chalk.dim(`  Organization: ${result.org.name}`))
      this.log(chalk.dim(`  Git identity: ${result.org.gitUsername} <${result.org.gitEmail}>`))
    }

    this.log(chalk.dim(`  Location: ${result.repoPath}`))
    this.log('')
  }

  private async chooseTarget(plan: ClonePlan): Promise<CloneTarget> {
    this.log(chalk.yellow(`Organization '${plan.orgName}' not configured`))

    const {action} = await Enquirer.prompt<{action: string}>({
      choices: [
        {message: `Create '${plan.orgName}' organization`, name: 'create'},
        {message: 'Select existing organization', name: 'select'},
        {message: 'Clone without organization config', name: 'skip'},
      ],
      message: 'What would you like to do?',
      name: 'action',
      type: 'select',
    })

    if (action === 'create') {
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
      return {gitEmail: email, gitUsername: username, kind: 'new-org'}
    }

    if (action === 'select') {
      if (plan.organizations.length === 0) {
        this.error('No organizations configured. Run "dotsloth org add" first.')
      }

      const {selectedOrg} = await Enquirer.prompt<{selectedOrg: string}>({
        choices: plan.organizations.map((o) => ({message: `${o.name} (${o.gitEmail})`, name: o.name})),
        message: 'Select organization:',
        name: 'selectedOrg',
        type: 'select',
      })
      return {kind: 'org', name: selectedOrg}
    }

    return {kind: 'none'}
  }
}
