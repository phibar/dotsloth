/*
 * Purpose: CLI command that lists all git worktrees in the current repo.
 * Intention: realizes BaseCommand, uses listWorktrees from core/worktree.
 */

import * as process from 'node:process'

import chalk from 'chalk'

import {BaseCommand} from '../../cli/base-command.js'
import {listWorktrees} from '../../core/worktree.js'
import {isRepo} from '../../lib/repo-audit.js'

export default class WorktreeList extends BaseCommand {
  static override description = 'List git worktrees in the current repo'
  static override examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    const repoPath = process.cwd()

    if (!isRepo(repoPath)) {
      this.error('Not inside a git repository')
    }

    const worktrees = await listWorktrees(repoPath)

    if (worktrees.length === 0) {
      this.log(chalk.dim('No worktrees found'))
      return
    }

    for (const wt of worktrees) {
      const issue = wt.issue ? chalk.cyan(`#${wt.issue}`) : chalk.dim('no issue')
      this.log(`${chalk.bold(wt.branch)} ${chalk.dim('·')} ${issue}`)
      this.log(chalk.dim(`  ${wt.path}`))
    }

    this.log('')
  }
}
