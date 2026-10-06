import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {configExists, isIcloudAccessible, loadConfig} from '../lib/config.js'
import {listSecretNames, listSshKeys} from '../lib/keychain.js'
import {PATHS} from '../lib/paths.js'
import {checkSymlinks} from '../lib/symlink.js'

export default class Status extends Command {
  static override description = 'Show current dotsloth configuration status'
static override examples = ['<%= config.bin %> <%= command.id %>']
static override flags = {
    verbose: Flags.boolean({char: 'v', description: 'Show detailed status'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Status)

    this.log(chalk.bold('\n🦥 dotsloth status\n'))

    // Check iCloud accessibility
    const icloudOk = isIcloudAccessible()
    this.log(chalk.bold('iCloud Drive:'))
    if (icloudOk) {
      this.log(`  ${chalk.green('✓')} Accessible at ${PATHS.icloudDrive}`)
    } else {
      this.log(`  ${chalk.red('✗')} Not accessible - is iCloud Drive enabled?`)
      return
    }

    // Check config
    const hasConfig = configExists()
    this.log('')
    this.log(chalk.bold('Configuration:'))
    if (hasConfig) {
      this.log(`  ${chalk.green('✓')} Config found at ${PATHS.icloudConfig}`)
    } else {
      this.log(`  ${chalk.yellow('!')} No config found - run 'dotsloth init' to set up`)
    }

    // Load and display config details
    const config = loadConfig()
    if (config) {
      this.log('')
      this.log(chalk.bold('Organizations:'))
      if (config.organizations.length === 0) {
        this.log(`  ${chalk.yellow('!')} No organizations configured - run 'dotsloth org add'`)
      } else {
        for (const org of config.organizations) {
          this.log(`  ${chalk.cyan(org.name)} (${org.folderName})`)
          this.log(`    Email: ${org.gitEmail}`)
          this.log(`    Username: ${org.gitUsername}`)
        }
      }

      // Check symlinks
      this.log('')
      this.log(chalk.bold('Symlinks:'))
      const symlinkStatuses = checkSymlinks(config.syncedFiles)
      for (const status of symlinkStatuses) {
        if (status.isValid) {
          this.log(`  ${chalk.green('✓')} ${status.target}`)
        } else if (status.exists) {
          this.log(`  ${chalk.yellow('!')} ${status.target} - ${status.error}`)
        } else {
          this.log(`  ${chalk.red('✗')} ${status.target} - Not set up`)
        }

        if (flags.verbose) {
          this.log(`      → ${status.source}`)
        }
      }

      // SSH signing status
      this.log('')
      this.log(chalk.bold('SSH Signing:'))
      if (config.sshSigning.enabled) {
        this.log(`  ${chalk.green('✓')} Enabled with key: ${config.sshSigning.defaultKeyPath}`)
      } else {
        this.log(`  ${chalk.yellow('!')} Disabled`)
      }
    }

    // Check secrets in keychain
    this.log('')
    this.log(chalk.bold('Secrets (Keychain):'))
    const secretNames = listSecretNames()
    if (secretNames.length === 0) {
      this.log(`  ${chalk.yellow('!')} No secrets stored`)
    } else {
      this.log(`  ${chalk.green('✓')} ${secretNames.length} secret(s) stored`)
      if (flags.verbose) {
        for (const name of secretNames) {
          this.log(`    - ${name}`)
        }
      }
    }

    // Check SSH keys in agent
    this.log('')
    this.log(chalk.bold('SSH Keys (Agent):'))
    const sshKeys = listSshKeys()
    if (sshKeys.length === 0) {
      this.log(`  ${chalk.yellow('!')} No SSH keys loaded in agent`)
    } else {
      this.log(`  ${chalk.green('✓')} ${sshKeys.length} key(s) loaded`)
      if (flags.verbose) {
        for (const key of sshKeys) {
          this.log(`    - ${key}`)
        }
      }
    }

    // Current directory org detection
    const cwd = process.cwd()
    if (config && cwd.startsWith(PATHS.githubRoot)) {
      this.log('')
      this.log(chalk.bold('Current Directory:'))
      const relPath = cwd.replace(PATHS.githubRoot + '/', '')
      const parts = relPath.split('/')
      if (parts.length > 0) {
        const orgFolder = parts[0]
        const org = config.organizations.find(
          (o) => o.folderName.toLowerCase() === orgFolder.toLowerCase(),
        )
        if (org) {
          this.log(`  ${chalk.green('✓')} In ${chalk.cyan(org.name)} org`)
          this.log(`    Git identity: ${org.gitUsername} <${org.gitEmail}>`)
        } else {
          this.log(`  ${chalk.yellow('!')} Folder '${orgFolder}' not configured as an organization`)
        }
      }
    }

    this.log('')
  }
}
