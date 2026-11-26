import {Command} from '@oclif/core'
import chalk from 'chalk'
import {CoreError} from '../core/errors.js'
import {checkForUpdate} from '../core/update.js'

/**
 * Purpose: give every command one way to end — a CoreError as a clean
 * message, a cancelled prompt as "Cancelled" — and tell of a newer release.
 *
 * Intention: extends oclif's Command; uses core/errors and core/update.
 * The commands that call into core or ask with @inquirer/prompts extend it.
 */
export abstract class BaseCommand extends Command {
  protected override async catch(error: Error & {exitCode?: number}): Promise<unknown> {
    // @inquirer/prompts rejects with ExitPromptError on Ctrl+C; 130 is the shell's code for an interrupt.
    if (error.name === 'ExitPromptError') {
      this.log(chalk.dim('Cancelled'))
      process.exitCode = 130
      return
    }

    if (error instanceof CoreError) {
      this.error([error.message, ...error.details.map((detail) => `  - ${detail}`)].join('\n'), {exit: 1})
    }

    return super.catch(error)
  }

  protected override async finally(error: Error | undefined): Promise<unknown> {
    const result = await super.finally(error)
    if (!error && this.id !== 'update') {
      const update = await checkForUpdate(this.config.version).catch(() => null)
      if (update) {
        this.log(
          chalk.dim(`\nℹ  dotsloth ${update.latest} available (you have ${update.current}) — run: dotsloth update`),
        )
      }
    }

    return result
  }
}
