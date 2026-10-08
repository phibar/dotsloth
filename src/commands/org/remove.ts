import {Args, Flags} from '@oclif/core'
import chalk from 'chalk'
import Enquirer from 'enquirer'
import {printAutoSync} from '../../cli/autosync.js'
import {BaseCommand} from '../../cli/base-command.js'
import {getOrg, removeOrg} from '../../core/orgs.js'

export default class OrgRemove extends BaseCommand {
  static override args = {
    name: Args.string({description: 'Organization name to remove', required: true}),
  }
  static override description = 'Remove an organization configuration'
  static override examples = ['<%= config.bin %> <%= command.id %> phibar']
  static override flags = {
    'delete-repos': Flags.boolean({description: 'Also delete the repository folder'}),
    force: Flags.boolean({char: 'f', description: 'Skip confirmation'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(OrgRemove)

    const org = getOrg(args.name)

    if (!(flags.force || (await this.confirm(this.removeMessage(org.name, org.repoCount, org.path))))) {
      this.log(chalk.yellow('Cancelled'))
      return
    }

    // Deleting repositories gets its own, explicit confirmation unless forced.
    const deleteRepos =
      flags['delete-repos'] &&
      org.exists &&
      (flags.force ||
        (await this.confirm(chalk.red(`DELETE ${org.path} and all ${org.repoCount} repos? This cannot be undone!`))))

    const result = await removeOrg(org.name, {deleteRepos})

    this.log(chalk.dim('Removed organization git config'))
    if (result.deletedFolder) {
      this.log(chalk.dim(`Deleted: ${org.path}`))
    }

    this.log('')
    this.log(chalk.green(`✓ Organization '${org.name}' removed`))
    printAutoSync(this.log.bind(this), result.sync)
  }

  private async confirm(message: string): Promise<boolean> {
    const {confirm} = await Enquirer.prompt<{confirm: boolean}>({
      initial: false,
      message,
      name: 'confirm',
      type: 'confirm',
    })
    return confirm
  }

  private removeMessage(name: string, repoCount: number, path: string): string {
    const repos = repoCount > 0 ? ` (${repoCount} repos in ${path})` : ''
    return `Are you sure you want to remove '${name}'?${repos}`
  }
}
