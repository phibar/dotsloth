import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import * as fs from 'node:fs'

import {isIcloudAccessible, loadConfig, saveConfig} from '../lib/config.js'
import {generateMainGitconfig, readPublicKey, writeAllowedSigners, writeOrgGitconfig} from '../lib/git.js'
import {getIcloudDotfilePath} from '../lib/paths.js'
import {createSymlink} from '../lib/symlink.js'

export default class Sync extends Command {
  static override description = 'Sync configurations from iCloud Drive'
static override examples = ['<%= config.bin %> <%= command.id %>']
static override flags = {
    'dry-run': Flags.boolean({description: 'Show what would be synced without making changes'}),
    force: Flags.boolean({char: 'f', description: 'Force overwrite local files'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Sync)

    this.log(chalk.bold('\n🦥 dotsloth sync\n'))

    // Check iCloud accessibility
    if (!isIcloudAccessible()) {
      this.error('iCloud Drive is not accessible')
    }

    // Load config
    const config = loadConfig()
    if (!config) {
      this.error('No configuration found. Run "dotsloth init" first.')
    }

    if (flags['dry-run']) {
      this.log(chalk.yellow('Dry run mode - no changes will be made\n'))
    }

    // Regenerate org gitconfigs
    this.log(chalk.bold('Organization configs:'))
    for (const org of config.organizations) {
      if (!flags['dry-run']) {
        writeOrgGitconfig(org)
      }

      this.log(chalk.green('✓') + ` ${org.name} (${org.gitEmail})`)
    }

    if (config.organizations.length === 0) {
      this.log(chalk.dim('  No organizations configured'))
    }

    // Regenerate main gitconfig
    this.log('')
    this.log(chalk.bold('Main gitconfig:'))

    // Get username from first org or default
    const userName = config.organizations.length > 0 ? config.organizations[0].gitUsername : 'Your Name'

    const gitconfigContent = generateMainGitconfig(config, userName)
    const icloudGitconfig = getIcloudDotfilePath('gitconfig')

    if (!flags['dry-run']) {
      fs.writeFileSync(icloudGitconfig, gitconfigContent, 'utf-8')
    }

    this.log(chalk.green('✓') + ' Generated gitconfig with includeIf patterns')

    // Regenerate allowed_signers
    if (config.sshSigning.enabled) {
      this.log('')
      this.log(chalk.bold('SSH signing:'))

      const pubKeyPath = config.sshSigning.defaultKeyPath + '.pub'
      const publicKey = readPublicKey(pubKeyPath)

      if (publicKey) {
        if (!flags['dry-run']) {
          writeAllowedSigners(config, publicKey)
        }

        this.log(chalk.green('✓') + ' Updated allowed_signers')
      } else {
        this.log(chalk.yellow('!') + ` Could not read public key from ${pubKeyPath}`)
      }
    }

    // Verify/create symlinks
    this.log('')
    this.log(chalk.bold('Symlinks:'))

    for (const syncedFile of config.syncedFiles) {
      if (!fs.existsSync(syncedFile.source)) {
        this.log(chalk.yellow('!') + ` Source missing: ${syncedFile.source}`)
        continue
      }

      if (flags['dry-run']) {
        this.log(chalk.dim(`  Would link: ${syncedFile.target} → ${syncedFile.source}`))
      } else {
        const result = await createSymlink({
          backup: !flags.force,
          source: syncedFile.source,
          target: syncedFile.target,
        })

        if (result.isValid) {
          this.log(chalk.green('✓') + ` ${result.target}`)
        } else {
          this.log(chalk.red('✗') + ` ${result.target}: ${result.error}`)
        }
      }
    }

    // Save config (in case any updates were made)
    if (!flags['dry-run']) {
      saveConfig(config)
    }

    this.log('')
    this.log(chalk.bold.green('🦥 Sync complete!'))
    this.log('')
  }
}
