/**
 * Purpose: core's way to bring gitconfigs, allowed signers and symlinks in
 * line with config.json.
 *
 * Intention: re-exports runSync from lib/sync, so commands and the server
 * reach it through core.
 */

export type {SyncOptions, SyncResult, SyncStep} from '../lib/sync.js'
export {runSync} from '../lib/sync.js'
