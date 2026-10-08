import {Flags} from '@oclif/core'
import chalk from 'chalk'
import {BaseCommand} from '../../cli/base-command.js'
import {listOrgs} from '../../core/orgs.js'
import {readConfig} from '../../lib/config.js'

export default class OrgList extends BaseCommand {
  static override description = 'List configured organizations'
  static override examples = ['<%= config.bin %> <%= command.id %>']
  static override flags = {
    json: Flags.boolean({description: 'Output as JSON'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(OrgList)

    const config = readConfig()
    const orgs = config ? listOrgs(config) : []

    if (flags.json) {
      // The configured organizations as stored, without the computed folder info.
      this.log(JSON.stringify(config?.organizations ?? [], null, 2))
      return
    }

    if (orgs.length === 0) {
      this.log(chalk.yellow('No organizations configured'))
      this.log(chalk.dim("Run 'dotsloth org add' to add an organization"))
      return
    }

    this.log(chalk.bold(`\n📁 Organizations (${orgs.length}):\n`))

    for (const org of orgs) {
      this.log(`  ${chalk.cyan(org.name)}`)
      this.log(`    Email:    ${org.gitEmail}`)
      this.log(`    Username: ${org.gitUsername}`)
      this.log(
        `    Path:     ${org.path} ${org.exists ? chalk.green(`(${org.repoCount} repos)`) : chalk.yellow('(not created)')}`,
      )
      this.log('')
    }
  }
}
