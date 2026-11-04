import {Command} from '@oclif/core'
import chalk from 'chalk'
import {CoreError} from '../core/errors.js'
import {checkForUpdate} from '../core/update.js'

/** Commands that call into src/core: a CoreError becomes a clean error message and exit code 1. */
export abstract class BaseCommand extends Command {
  protected override async catch(error: Error & {exitCode?: number}): Promise<unknown> {
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
