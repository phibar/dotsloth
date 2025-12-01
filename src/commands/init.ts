import * as fs from 'node:fs'

import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import Enquirer from 'enquirer'

import {
  configExists,
  ensureIcloudStructure,
  getDefaultConfig,
  isIcloudAccessible,
  loadConfig,
  saveConfig,
} from '../lib/config.js'
import {generateMainGitconfig, readPublicKey, writeAllowedSigners, writeOrgGitconfig} from '../lib/git.js'
import {addSecret, addSshKeyToKeychain} from '../lib/keychain.js'
import {getIcloudDotfilePath, PATHS} from '../lib/paths.js'
import {countSecrets, extractSecrets} from '../lib/secrets.js'
import {createSymlink} from '../lib/symlink.js'

export default class Init extends Command {
  static override description = 'Initialize dotsloth on this machine'

  static override examples = ['<%= config.bin %> <%= command.id %>']

  static override flags = {
    force: Flags.boolean({char: 'f', description: 'Overwrite existing configuration'}),
    'skip-secrets': Flags.boolean({description: 'Skip secrets extraction from zprofile'}),
    'skip-ssh': Flags.boolean({description: 'Skip SSH keychain setup'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Init)

    this.log(chalk.bold('\n🦥 dotsloth init\n'))

    // Check iCloud accessibility
    if (!isIcloudAccessible()) {
      this.error('iCloud Drive is not accessible. Please ensure iCloud Drive is enabled.')
    }

    this.log(chalk.green('✓') + ' iCloud Drive accessible')

    // Ensure iCloud directory structure
    ensureIcloudStructure()
    this.log(chalk.green('✓') + ' iCloud directory structure created')

    // Check if config already exists
    const existingConfig = configExists()
    let config = loadConfig()

    if (existingConfig && !flags.force) {
      this.log(chalk.green('✓') + ' Existing configuration found')
    } else {
      // Create new config
      config = getDefaultConfig()
      saveConfig(config)
      this.log(chalk.green('✓') + ' Created new configuration')
    }

    if (!config) {
      config = getDefaultConfig()
    }

    // Get username for gitconfig
    let userName = 'Your Name'
    if (config.organizations.length > 0) {
      userName = config.organizations[0].gitUsername
    } else {
      const response = await Enquirer.prompt<{name: string}>({
        type: 'input',
        name: 'name',
        message: 'Your name (for git commits):',
        validate: (input) => (input.length > 0 ? true : 'Name is required'),
      })
      userName = response.name
    }

    // Handle secrets extraction from zprofile
    if (!flags['skip-secrets'] && fs.existsSync(PATHS.zprofile)) {
      const zprofileContent = fs.readFileSync(PATHS.zprofile, 'utf-8')
      const secretCount = countSecrets(zprofileContent)

      if (secretCount > 0) {
        this.log('')
        this.log(chalk.yellow(`Found ${secretCount} secret(s) in your .zprofile`))

        const {extractSecrets: shouldExtract} = await Enquirer.prompt<{extractSecrets: boolean}>({
          type: 'confirm',
          name: 'extractSecrets',
          message: 'Extract secrets to iCloud Keychain?',
          initial: true,
        })

        if (shouldExtract) {
          const {cleanContent, secrets} = extractSecrets(zprofileContent)

          // Store secrets in keychain
          for (const secret of secrets) {
            try {
              addSecret(secret.name, secret.value)
              this.log(chalk.dim(`  Stored: ${secret.name}`))
            } catch (error) {
              this.log(chalk.red(`  Failed to store ${secret.name}: ${error}`))
            }
          }

          // Write clean zprofile to iCloud
          const icloudZprofile = getIcloudDotfilePath('zprofile')
          fs.writeFileSync(icloudZprofile, cleanContent, 'utf-8')
          this.log(chalk.green('✓') + ` Extracted ${secrets.length} secret(s) to Keychain`)
          this.log(chalk.green('✓') + ' Created clean zprofile in iCloud')
        }
      }
    }

    // Create zprofile in iCloud if it doesn't exist
    const icloudZprofile = getIcloudDotfilePath('zprofile')
    if (!fs.existsSync(icloudZprofile)) {
      if (fs.existsSync(PATHS.zprofile)) {
        // Copy existing zprofile
        const content = fs.readFileSync(PATHS.zprofile, 'utf-8')
        fs.writeFileSync(icloudZprofile, content, 'utf-8')
        this.log(chalk.green('✓') + ' Copied zprofile to iCloud')
      } else {
        // Create minimal zprofile
        const minimalZprofile = `# dotsloth managed zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"

# Load secrets from iCloud Keychain
eval "$(dotsloth secret load)"
`
        fs.writeFileSync(icloudZprofile, minimalZprofile, 'utf-8')
        this.log(chalk.green('✓') + ' Created minimal zprofile in iCloud')
      }
    }

    // Generate and save main gitconfig
    const gitconfigContent = generateMainGitconfig(config, userName)
    const icloudGitconfig = getIcloudDotfilePath('gitconfig')
    fs.writeFileSync(icloudGitconfig, gitconfigContent, 'utf-8')
    this.log(chalk.green('✓') + ' Generated gitconfig in iCloud')

    // Write org gitconfigs
    for (const org of config.organizations) {
      writeOrgGitconfig(org)
    }

    if (config.organizations.length > 0) {
      this.log(chalk.green('✓') + ` Generated ${config.organizations.length} org gitconfig(s)`)
    }

    // Create SSH config if it doesn't exist in iCloud
    const icloudSshConfig = getIcloudDotfilePath('ssh_config')
    if (!fs.existsSync(icloudSshConfig)) {
      if (fs.existsSync(PATHS.sshConfig)) {
        // Copy existing ssh config
        const content = fs.readFileSync(PATHS.sshConfig, 'utf-8')
        fs.writeFileSync(icloudSshConfig, content, 'utf-8')
        this.log(chalk.green('✓') + ' Copied SSH config to iCloud')
      } else {
        // Create minimal SSH config
        const minimalSshConfig = `# dotsloth managed SSH config
Host *
    AddKeysToAgent yes
    UseKeychain yes
    IdentityFile ~/.ssh/id_ed25519

Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
`
        fs.writeFileSync(icloudSshConfig, minimalSshConfig, 'utf-8')
        this.log(chalk.green('✓') + ' Created SSH config in iCloud')
      }
    }

    // Create allowed_signers if SSH signing is enabled
    if (config.sshSigning.enabled) {
      const pubKeyPath = config.sshSigning.defaultKeyPath + '.pub'
      const publicKey = readPublicKey(pubKeyPath)
      if (publicKey) {
        writeAllowedSigners(config, publicKey)
        this.log(chalk.green('✓') + ' Generated allowed_signers file')
      } else {
        this.log(chalk.yellow('!') + ` Could not read public key from ${pubKeyPath}`)
      }
    }

    // Create symlinks
    this.log('')
    this.log(chalk.bold('Creating symlinks...'))

    for (const syncedFile of config.syncedFiles) {
      const result = await createSymlink({
        source: syncedFile.source,
        target: syncedFile.target,
        backup: true,
      })

      if (result.isValid) {
        this.log(chalk.green('✓') + ` ${result.target}`)
      } else {
        this.log(chalk.red('✗') + ` ${result.target}: ${result.error}`)
      }
    }

    // Add SSH key to keychain
    if (!flags['skip-ssh'] && fs.existsSync(PATHS.defaultSshKey)) {
      this.log('')
      try {
        addSshKeyToKeychain(PATHS.defaultSshKey)
        this.log(chalk.green('✓') + ' Added SSH key to Keychain')
      } catch {
        this.log(chalk.yellow('!') + ' Could not add SSH key to Keychain (may already be added)')
      }
    }

    // Create github root directory
    if (!fs.existsSync(config.paths.githubRoot)) {
      fs.mkdirSync(config.paths.githubRoot, {recursive: true})
      this.log(chalk.green('✓') + ` Created ${config.paths.githubRoot}`)
    }

    this.log('')
    this.log(chalk.bold.green('🦥 dotsloth initialized!'))
    this.log('')
    this.log(chalk.dim('Next steps:'))
    this.log(chalk.dim('  1. Add organizations: dotsloth org add'))
    this.log(chalk.dim('  2. Clone repos:       dotsloth clone <url>'))
    this.log(chalk.dim('  3. Check status:      dotsloth status'))
    this.log('')
  }
}
