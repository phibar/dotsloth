import {Command} from '@oclif/core'

import {CoreError} from '../core/errors.js'

/** Commands that call into src/core: a CoreError becomes a clean error message and exit code 1. */
export abstract class BaseCommand extends Command {
  protected override async catch(error: Error & {exitCode?: number}): Promise<unknown> {
    if (error instanceof CoreError) {
      this.error([error.message, ...error.details.map((detail) => `  - ${detail}`)].join('\n'), {exit: 1})
    }

    return super.catch(error)
  }
}
