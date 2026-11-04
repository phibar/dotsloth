/*
 * Purpose: CLI command that updates dotsloth to the latest version via npm.
 * Intention: realizes BaseCommand, uses runAsync from exec, checkForUpdate from core/update.
 */

import chalk from 'chalk'

import {BaseCommand} from '../cli/base-command.js'
import {checkForUpdate} from '../core/update.js'
import {runAsync} from '../lib/exec.js'

export default class Update extends BaseCommand {
  static override description = 'Update dotsloth to the latest version'
  static override examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    this.log(chalk.bold('\n🦥 dotsloth update\n'))

    const update = await checkForUpdate(this.config.version)
    if (!update) {
      this.log(chalk.green('✓') + ` Already on the latest version (${this.config.version})`)
      this.log('')
      return
    }

    this.log(`Updating ${chalk.dim(update.current)} → ${chalk.bold(update.latest)}\n`)

    try {
      await runAsync('npm', ['install', '-g', `@phibar/dotsloth@${update.latest}`])
      this.log(chalk.bold.green(`✓ Updated to ${update.latest}`))
    } catch (error) {
      this.log(chalk.red('✗') + ' Update failed: ' + (error instanceof Error ? error.message : String(error)))
      this.log(chalk.dim(`  Run manually: npm install -g @phibar/dotsloth@latest`))
      this.exit(1)
    }

    this.log('')
  }
}
