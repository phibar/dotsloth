import {Command} from '@oclif/core'
import chalk from 'chalk'
import * as fs from 'node:fs'

import {CLAUDE_STORE, claudeInstalled, configFiles, SHARED_CONFIG_FILES} from '../../lib/claude.js'
import {checkSymlink} from '../../lib/symlink.js'

export default class ClaudeStatus extends Command {
  static override description = 'Show which Claude Code config is shared between machines'
static override examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    this.log(chalk.bold('\n🦥 claude status\n'))

    if (!claudeInstalled()) {
      this.log(chalk.yellow('~/.claude not found'))
      return
    }

    this.log(chalk.dim(`Store: ${CLAUDE_STORE}`))
    this.log('')

    for (const file of configFiles(SHARED_CONFIG_FILES)) {
      if (!file.existsLocally && !file.existsInStore) {
        this.log(chalk.dim(`  ${file.name.padEnd(16)} not present`))
        continue
      }

      const link = checkSymlink(file.storePath, file.localPath)
      if (link.isValid) {
        this.log(chalk.green('  ✓') + ` ${file.name.padEnd(16)} shared`)
      } else if (fs.existsSync(file.localPath)) {
        this.log(chalk.yellow('  !') + ` ${file.name.padEnd(16)} local only` + chalk.dim(' — run "dotsloth claude link"'))
      } else {
        this.log(chalk.yellow('  !') + ` ${file.name.padEnd(16)} in store, not linked here`)
      }
    }

    this.log('')
  }
}
