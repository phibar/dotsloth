import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {claudeInstalled, configFiles, seedStore, SHARED_CONFIG_FILES} from '../../lib/claude.js'
import {loadConfig, saveConfig} from '../../lib/config.js'
import {createSymlink} from '../../lib/symlink.js'

export default class ClaudeLink extends Command {
  static override description = 'Share Claude Code settings between machines via the dotsloth store'
static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --dry-run']
static override flags = {
    'dry-run': Flags.boolean({description: 'Show what would change without writing'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(ClaudeLink)

    if (!claudeInstalled()) {
      this.error('~/.claude not found — is Claude Code installed?')
    }

    const config = loadConfig()
    if (!config) {
      this.error('No configuration found. Run "dotsloth init" first.')
    }

    this.log(chalk.bold('\n🦥 claude settings\n'))

    const files = configFiles(SHARED_CONFIG_FILES)

    // Seed the store from this machine if it is the first to adopt syncing.
    if (!flags['dry-run']) {
      for (const seeded of seedStore(files)) {
        this.log(chalk.dim(`  seeded store from local ${seeded.name}`))
      }
    }

    for (const file of configFiles(SHARED_CONFIG_FILES)) {
      if (!file.existsInStore && !file.existsLocally) {
        this.log(chalk.dim(`  skip ${file.name} — not present on this machine or in the store`))
        continue
      }

      if (flags['dry-run']) {
        this.log(chalk.dim(`  would link ${file.localPath} → ${file.storePath}`))
        continue
      }

      // biome-ignore lint/performance/noAwaitInLoops: sequential on purpose, each link reports its own line
      const result = await createSymlink({backup: true, source: file.storePath, target: file.localPath})
      if (result.isValid) {
        this.log(chalk.green('✓') + ` ${file.name}`)

        // Record it so "dotsloth sync" re-establishes the link on a new machine.
        const already = config.syncedFiles.some((f) => f.target === file.localPath)
        if (!already) {
          config.syncedFiles.push({source: file.storePath, target: file.localPath})
        }
      } else {
        this.log(chalk.red('✗') + ` ${file.name}: ${result.error}`)
      }
    }

    if (!flags['dry-run']) {
      saveConfig(config)
    }

    this.log('')
    this.log(chalk.dim('History and memory are handled separately — they must not be symlinked.'))
    this.log('')
  }
}
