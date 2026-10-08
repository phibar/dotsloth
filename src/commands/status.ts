import {Flags} from '@oclif/core'
import chalk from 'chalk'
import {BaseCommand} from '../cli/base-command.js'
import {getStatus, type Status as StatusData} from '../core/status.js'

export default class Status extends BaseCommand {
  static override description = 'Show current dotsloth configuration status'
  static override examples = ['<%= config.bin %> <%= command.id %>']
  static override flags = {
    verbose: Flags.boolean({char: 'v', description: 'Show detailed status'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Status)
    const status = getStatus({directory: process.cwd()})

    this.log(chalk.bold('\n🦥 dotsloth status\n'))

    this.log(chalk.bold('iCloud Drive:'))
    if (!status.icloud.accessible) {
      this.log(`  ${chalk.red('✗')} Not accessible - is iCloud Drive enabled?`)
      return
    }

    this.log(`  ${chalk.green('✓')} Accessible at ${status.icloud.path}`)

    this.printConfig(status, flags.verbose)
    const {verbose} = flags
    this.printList('Secrets (Keychain):', status.secrets.names, {
      found: 'secret(s) stored',
      none: 'No secrets stored',
      verbose,
    })
    this.printList('SSH Keys (Agent):', status.sshKeys, {
      found: 'key(s) loaded',
      none: 'No SSH keys loaded in agent',
      verbose,
    })
    this.printDirectory(status)

    this.log('')
  }

  private printConfig(status: StatusData, verbose: boolean): void {
    this.log('')
    this.log(chalk.bold('Configuration:'))
    if (!status.config.exists) {
      this.log(`  ${chalk.yellow('!')} No config found - run 'dotsloth init' to set up`)
      return
    }

    this.log(`  ${chalk.green('✓')} Config found at ${status.config.path}`)
    for (const error of status.config.errors ?? []) {
      this.log(`  ${chalk.red('✗')} ${error}`)
    }

    const config = status.config.value
    if (!config) return

    this.log('')
    this.log(chalk.bold('Organizations:'))
    if (config.organizations.length === 0) {
      this.log(`  ${chalk.yellow('!')} No organizations configured - run 'dotsloth org add'`)
    }

    for (const org of config.organizations) {
      this.log(`  ${chalk.cyan(org.name)} (${org.folderName})`)
      this.log(`    Email: ${org.gitEmail}`)
      this.log(`    Username: ${org.gitUsername}`)
    }

    this.log('')
    this.log(chalk.bold('Symlinks:'))
    for (const link of status.symlinks) {
      if (link.isValid) {
        this.log(`  ${chalk.green('✓')} ${link.target}`)
      } else if (link.exists) {
        this.log(`  ${chalk.yellow('!')} ${link.target} - ${link.error}`)
      } else {
        this.log(`  ${chalk.red('✗')} ${link.target} - Not set up`)
      }

      if (verbose) this.log(`      → ${link.source}`)
    }

    this.log('')
    this.log(chalk.bold('SSH Signing:'))
    if (config.sshSigning.enabled) {
      this.log(`  ${chalk.green('✓')} Enabled with key: ${config.sshSigning.defaultKeyPath}`)
    } else {
      this.log(`  ${chalk.yellow('!')} Disabled`)
    }
  }

  private printDirectory(status: StatusData): void {
    if (!status.directory) return

    this.log('')
    this.log(chalk.bold('Current Directory:'))
    const {folder, org} = status.directory
    if (org) {
      this.log(`  ${chalk.green('✓')} In ${chalk.cyan(org.name)} org`)
      this.log(`    Git identity: ${org.gitUsername} <${org.gitEmail}>`)
    } else {
      this.log(`  ${chalk.yellow('!')} Folder '${folder}' not configured as an organization`)
    }
  }

  private printList(
    title: string,
    items: string[],
    {found, none, verbose}: {found: string; none: string; verbose: boolean},
  ): void {
    this.log('')
    this.log(chalk.bold(title))
    if (items.length === 0) {
      this.log(`  ${chalk.yellow('!')} ${none}`)
      return
    }

    this.log(`  ${chalk.green('✓')} ${items.length} ${found}`)
    if (verbose) {
      for (const item of items) this.log(`    - ${item}`)
    }
  }
}
