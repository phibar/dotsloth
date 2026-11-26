import {Command} from '@oclif/core'
import chalk from 'chalk'
import {CoreError} from '../core/errors.js'
import {checkForUpdate} from '../core/update.js'

/**
 * Purpose: give every command one way to end — a CoreError as a clean
 * message, a cancelled prompt as "Cancelled" — and tell of a newer release.
 *
 * Intention: extends oclif's Command; uses core/errors and core/update.
 * The commands that call into core or ask with Enquirer extend it.
 */
export abstract class BaseCommand extends Command {
  public override async init(): Promise<void> {
    await super.init()
    process.on('unhandledRejection', (reason) =>
      exitOnClosedPrompt(reason, {exit: (code) => process.exit(code), log: (line) => this.log(line)}),
    )
  }

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

/**
 * On Ctrl+C, Enquirer 2.4.1 pauses its readline after closing it, which
 * Node 24 refuses with ERR_USE_AFTER_CLOSE (enquirer/enquirer#483). The
 * error escapes the prompt's promise, so it arrives here as an unhandled
 * rejection; any other reason is thrown on and fails the command as before.
 */
export function exitOnClosedPrompt(
  reason: unknown,
  {exit, log}: {exit: (code: number) => void; log: (line: string) => void},
): void {
  if ((reason as {code?: unknown} | null)?.code !== 'ERR_USE_AFTER_CLOSE') throw reason
  log(chalk.dim('Cancelled'))
  exit(130)
}
