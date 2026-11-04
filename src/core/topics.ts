/*
 * Purpose: Re-export the topics sync API for use by the CLI and server.
 * Intention: realizes the core/lib boundary pattern used by core/sync.ts.
 */

export type {TopicsOptions, TopicsResult} from '../lib/topics.js'
export {runTopicsSync} from '../lib/topics.js'
