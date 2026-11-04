/*
 * Purpose: CLI command that removes worktrees whose branch has been merged.
 * Intention: realizes BaseCommand, uses cleanWorktrees from core/worktree.
 */

import * as process from 'node:process'

import {Flags} from '@oclif/core'
import chalk from 'chalk'

import {BaseCommand} from '../../cli/base-command.js'
import {checkMerged, cleanWorktrees, listWorktrees} from '../../core/worktree.js'
import {isRepo} from '../../lib/repo-audit.js'

export default class WorktreeClean extends BaseCommand {
  static override description = 'Remove worktrees whose branch has been merged'
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --dry-run']
  static override flags = {
    'dry-run': Flags.boolean({description: 'Show what would be removed without touching anything'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(WorktreeClean)
    const repoPath = process.cwd()

    if (!isRepo(repoPath)) {
      this.error('Not inside a git repository')
    }

    if (flags['dry-run']) {
      this.log(chalk.yellow('Dry run — no changes will be made\n'))
    }

    this.log(chalk.dim('Checking worktrees…'))
    const result = flags['dry-run'] ? await this.dryRun(repoPath) : await cleanWorktrees(repoPath)

    if (result.removed.length === 0 && result.skipped.length === 0) {
      this.log(chalk.dim('Nothing to clean'))
      return
    }

    for (const wt of result.removed) {
      this.log(chalk.green('✓') + ` removed ${chalk.bold(wt.branch)}`)
      this.log(chalk.dim(`  ${wt.path}`))
    }

    for (const wt of result.skipped) {
      this.log(chalk.yellow('!') + ` could not remove ${chalk.bold(wt.branch)}`)
      this.log(chalk.dim(`  ${wt.path}`))
    }

    for (const wt of result.kept) {
      this.log(chalk.dim(`  kept ${wt.branch} (not merged)`))
    }

    this.log('')
  }

  private async dryRun(repoPath: string) {
    const worktrees = await listWorktrees(repoPath)
    const mergedFlags = await Promise.all(worktrees.map((wt) => checkMerged(repoPath, wt.branch)))
    const kept = worktrees.filter((_, i) => !mergedFlags[i])
    const removed = worktrees.filter((_, i) => mergedFlags[i])
    return {kept, removed, skipped: []}
  }
}
