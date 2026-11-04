/*
 * Purpose: Re-export the update check API for use by the CLI.
 * Intention: realizes the core/lib boundary pattern used by core/sync.ts.
 */

export type {UpdateInfo} from '../lib/update-check.js'
export {checkForUpdate} from '../lib/update-check.js'
