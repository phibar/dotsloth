import {Command} from '@oclif/core'

import {getAllSecrets} from '../../lib/keychain.js'
import {generateExportStatements} from '../../lib/secrets.js'

/**
 * Purpose: a new shell gets every secret as an environment variable.
 *
 * Intention: extends oclif's Command; uses lib/keychain and lib/secrets
 * directly; .zprofile runs its output.
 */
export default class SecretLoad extends Command {
  static override description = 'Output export statements for all secrets (for use in shell profile)'
  static override examples = ['<%= config.bin %> <%= command.id %>', 'eval "$(<%= config.bin %> <%= command.id %>)"']

  public async run(): Promise<void> {
    const secrets = getAllSecrets()

    if (secrets.length === 0) {
      // Output nothing - don't break shell profile
      return
    }

    // Output export statements
    const exports = generateExportStatements(secrets)
    this.log(exports)
  }
}
