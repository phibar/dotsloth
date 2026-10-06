import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import * as fs from 'node:fs'

import {loadConfig} from '../../lib/config.js'
import {getOrgRepoPath} from '../../lib/paths.js'

export default class OrgList extends Command {
  static override description = 'List configured organizations'
static override examples = ['<%= config.bin %> <%= command.id %>']
static override flags = {
    json: Flags.boolean({description: 'Output as JSON'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(OrgList)

    const config = loadConfig()

    if (!config || config.organizations.length === 0) {
      if (flags.json) {
        this.log(JSON.stringify([], null, 2))
      } else {
        this.log(chalk.yellow('No organizations configured'))
        this.log(chalk.dim("Run 'dotsloth org add' to add an organization"))
      }

      return
    }

    if (flags.json) {
      this.log(JSON.stringify(config.organizations, null, 2))
      return
    }

    this.log(chalk.bold(`\n📁 Organizations (${config.organizations.length}):\n`))

    for (const org of config.organizations) {
      const orgPath = getOrgRepoPath(org.folderName)
      const exists = fs.existsSync(orgPath)

      // Count repos in directory
      let repoCount = 0
      if (exists) {
        try {
          const entries = fs.readdirSync(orgPath, {withFileTypes: true})
          repoCount = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).length
        } catch {
          // Ignore errors
        }
      }

      this.log(`  ${chalk.cyan(org.name)}`)
      this.log(`    Email:    ${org.gitEmail}`)
      this.log(`    Username: ${org.gitUsername}`)
      this.log(`    Path:     ${orgPath} ${exists ? chalk.green(`(${repoCount} repos)`) : chalk.yellow('(not created)')}`)
      this.log('')
    }
  }
}
