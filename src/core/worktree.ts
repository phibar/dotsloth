/*
 * Purpose: Re-export the worktree API for use by the CLI.
 * Intention: realizes the core/lib boundary pattern used by core/sync.ts.
 */

export type {WorktreeCleanResult, WorktreeInfo, WorktreeNewOptions, WorktreeNewResult} from '../lib/worktree.js'
export {checkMerged, cleanWorktrees, listWorktrees, newWorktree} from '../lib/worktree.js'
