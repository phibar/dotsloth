import chalk from 'chalk'

import type {EnvTransfer} from '../core/env.js'

/** One line per env file a push or pull touched or skipped. */
export function printEnvTransfer(
  log: (message?: string) => void,
  transfer: EnvTransfer,
  {conflict, verb}: {conflict: string; verb: string},
): void {
  const {key} = transfer
  switch (transfer.outcome) {
    case 'conflict': {
      log(chalk.yellow('!') + ` ${key} ${chalk.dim(`${conflict} — use --force to overwrite`)}`)
      break
    }

    case 'copied': {
      log(chalk.green('✓') + ` ${key}`)
      break
    }

    case 'not-cloned': {
      log(chalk.dim(`  skip ${key} — repo not cloned`))
      break
    }

    default: {
      log(chalk.dim(`  would ${verb} ${key}`))
    }
  }
}
