import {checkbox, input, select} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import chalk from 'chalk'
import {printAutoSync} from '../cli/autosync.js'
import {BaseCommand} from '../cli/base-command.js'
import {type ClonePlan, type CloneTarget, clone, planClone} from '../core/clone.js'
import {cloneOrg, type OrgCloneFilter, type OrgClonePlan, type OrgRepo, planOrgClone} from '../core/clone-org.js'
import {parseGitUrl} from '../lib/git.js'

/**
 * Purpose: from the terminal, put a repository, or an organisation's
 * repositories, in the org folder whose git identity they belong to.
 *
 * Intention: realizes BaseCommand; uses core/clone for a URL and
 * core/clone-org for an organisation, and asks with @inquirer/prompts what core
 * leaves to a decision.
 */
export default class Clone extends BaseCommand {
  static override args = {
    source: Args.string({
      description: 'Repository URL, or an organisation to clone the repositories of',
      required: true,
    }),
  }
  static override description =
    "Clone a repository, or an organisation's repositories (optionally by topic), to the correct organization folder"
  static override examples = [
    '<%= config.bin %> <%= command.id %> git@github.com:phibar/some-repo.git',
    '<%= config.bin %> <%= command.id %> https://github.com/ipfs/kubo',
    '<%= config.bin %> <%= command.id %> git@github.com:fork/repo.git --org phibar',
    '<%= config.bin %> <%= command.id %> metatrom-ag --topic 0field',
    '<%= config.bin %> <%= command.id %> metatrom-ag -t 0field -t kernel --dry-run',
  ]
  static override flags = {
    'dry-run': Flags.boolean({description: 'Organisation: list the matching repositories, clone nothing'}),
    'include-archived': Flags.boolean({description: 'Organisation: clone archived repositories too'}),
    'include-forks': Flags.boolean({description: 'Organisation: clone forks too'}),
    org: Flags.string({char: 'o', description: 'Override organization (use a different org than detected)'}),
    topic: Flags.string({
      char: 't',
      description: 'Organisation: only repositories with this topic (repeat for any of several)',
      multiple: true,
    }),
    yes: Flags.boolean({char: 'y', description: 'Organisation: clone every matching repository without asking'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(Clone)
    if (!parseGitUrl(args.source.trim())) {
      await this.cloneOrganisation(args.source.trim(), flags)
      return
    }

    const plan = planClone(args.source, {org: flags.org})
    this.log(chalk.dim(`Repository: ${plan.orgName}/${plan.repo} on ${plan.host}`))

    const target = plan.org ? undefined : await this.chooseTarget(plan)

    const result = await clone(args.source, {interactive: true, org: flags.org, target}, (event) => {
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

  private async cloneOrganisation(
    owner: string,
    flags: OrgCloneFilter & {
      'dry-run': boolean
      'include-archived': boolean
      'include-forks': boolean
      topic?: string[]
      yes: boolean
    },
  ): Promise<void> {
    const filter: OrgCloneFilter = {
      includeArchived: flags['include-archived'],
      includeForks: flags['include-forks'],
      org: flags.org,
      topics: flags.topic,
    }
    const plan = await planOrgClone(owner, filter)
    const topics = filter.topics?.length ? ` with topic ${filter.topics.join(' or ')}` : ''
    this.log(chalk.dim(`Repositories of ${owner}${topics}: ${plan.repos.length}`))

    const fresh = plan.repos.filter((r) => !r.local)
    if (flags['dry-run'] || fresh.length === 0) {
      for (const repo of plan.repos) this.log(this.repoLine(repo))
      if (fresh.length === 0) this.log(chalk.green('✓') + ' Nothing to clone')
      return
    }

    const names = flags.yes ? fresh.map((r) => r.name) : await this.chooseRepos(plan)
    if (names.length === 0) {
      this.log(chalk.dim('Nothing selected'))
      return
    }

    const target = plan.org ? undefined : await this.chooseTarget(plan)
    const result = await cloneOrg(owner, {...filter, interactive: true, repos: names, target}, (event) => {
      if (event.type === 'org-created') this.log(chalk.green('✓') + ` Created organization '${event.name}'`)
      else if (event.type === 'repo') this.log('\n' + chalk.bold(`[${event.index}/${event.total}] ${event.name}`))
      else if (event.type === 'repo-local') this.log(chalk.dim(`  already at ${event.repoPath}`))
      else if (event.type === 'repo-failed') this.log(chalk.red('✗') + ` ${event.name}: ${event.message}`)
      else if (event.type === 'topics') this.log(chalk.dim('\nLinking topics...'))
    })

    printAutoSync(this.log.bind(this), result.sync, {quiet: true})
    if (!result.topics.ok) this.log(chalk.yellow('!') + ' Linking topics reported problems; run "dotsloth topics"')
    this.log('')
    this.log(chalk.green('✓') + ` Cloned ${result.cloned.length}, already there ${result.local.length}`)
    if (result.org) this.log(chalk.dim(`  Git identity: ${result.org.gitUsername} <${result.org.gitEmail}>`))
    if (result.failed.length > 0) {
      this.error(`${result.failed.length} failed: ${result.failed.map((f) => f.name).join(', ')}`)
    }
  }

  private async chooseRepos(plan: OrgClonePlan): Promise<string[]> {
    return checkbox(repoPicker(plan))
  }

  private repoLine(repo: OrgRepo): string {
    const mark = repo.local ? chalk.green('✓') : chalk.dim('·')
    const note = repo.local ? chalk.dim(' (already cloned)') : ''
    const topics = repo.topics.length > 0 ? chalk.dim(` [${repo.topics.join(', ')}]`) : ''
    return `${mark} ${repo.name}${topics}${note}`
  }

  private async chooseTarget(plan: Pick<ClonePlan, 'organizations' | 'orgName'>): Promise<CloneTarget> {
    this.log(chalk.yellow(`Organization '${plan.orgName}' not configured`))

    const action = await select({
      choices: [
        {name: `Create '${plan.orgName}' organization`, value: 'create'},
        {name: 'Select existing organization', value: 'select'},
        {name: 'Clone without organization config', value: 'skip'},
      ],
      message: 'What would you like to do?',
    })

    if (action === 'create') {
      const email = await input({
        message: 'Git email for this organization:',
        validate: (value) => (value.includes('@') ? true : 'Invalid email'),
      })
      const username = await input({
        message: 'Git username for this organization:',
        validate: (value) => (value.length > 0 ? true : 'Username required'),
      })
      return {gitEmail: email, gitUsername: username, kind: 'new-org'}
    }

    if (action === 'select') {
      if (plan.organizations.length === 0) {
        this.error('No organizations configured. Run "dotsloth org add" first.')
      }

      const selectedOrg = await select({
        choices: plan.organizations.map((o) => ({name: `${o.name} (${o.gitEmail})`, value: o.name})),
        message: 'Select organization:',
      })
      return {kind: 'org', name: selectedOrg}
    }

    return {kind: 'none'}
  }
}

/** The checkbox `clone <org>` asks with: the repositories still missing ticked, those already cloned disabled. */
export function repoPicker(plan: Pick<OrgClonePlan, 'repos'>, rows = process.stdout.rows) {
  return {
    // The checkbox shows a choice's description only under the highlighted row, so the topics go into its name;
    // a disabled one shows its reason after the name, in their place.
    choices: plan.repos.map((r) => ({
      checked: !r.local,
      disabled: r.local ? 'already cloned' : false,
      name: r.local || r.topics.length === 0 ? r.name : `${r.name}  ${chalk.dim(r.topics.join(', '))}`,
      value: r.name,
    })),
    message: 'Clone which repositories?',
    // As many rows as the terminal holds beside the lines around the list, and at least the checkbox's own 7.
    pageSize: Math.max(7, (rows ?? 0) - 6),
  }
}
