/*
 * Purpose: CLI command that creates a git worktree for a GitHub issue.
 * Intention: realizes BaseCommand, uses newWorktree from core/worktree.
 */

import * as process from 'node:process'

import {Args} from '@oclif/core'
import chalk from 'chalk'

import {BaseCommand} from '../../cli/base-command.js'
import {newWorktree} from '../../core/worktree.js'
import {isRepo} from '../../lib/repo-audit.js'

export default class WorktreeNew extends BaseCommand {
  static override args = {
    issue: Args.integer({description: 'GitHub issue number', required: true}),
  }
  static override description = 'Create a git worktree for a GitHub issue'
  static override examples = ['<%= config.bin %> <%= command.id %> 42']

  public async run(): Promise<void> {
    const {args} = await this.parse(WorktreeNew)
    const repoPath = process.cwd()

    if (!isRepo(repoPath)) {
      this.error('Not inside a git repository')
    }

    this.log(chalk.dim(`Creating worktree for issue #${args.issue}…`))

    const result = await newWorktree({issue: args.issue, repoPath})

    this.log('')
    this.log(chalk.bold.green('✓ Worktree created'))
    this.log(chalk.dim(`  Branch: ${result.branch}`))
    this.log(chalk.dim(`  Path:   ${result.path}`))
    this.log('')
    this.log(chalk.dim(`  cd ${result.path}`))
    this.log('')
  }
}
