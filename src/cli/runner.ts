/*
 * Purpose: How a runner is named on the command line and shown in the
 * terminal, the same in every `dotsloth runner` command.
 * Intention: uses RunnerInfo from core/runners and chalk; speaks to
 * commands/runner.
 */

import {Args} from '@oclif/core'
import chalk from 'chalk'

import type {RunnerInfo} from '../core/runners.js'

export const runnerArgs = {
  org: Args.string({description: 'Organization (as configured in dotsloth)', required: true}),
  name: Args.string({description: 'Runner name; optional while the organization has one runner on this Mac'}),
}

function githubState(runner: RunnerInfo): string {
  if (!runner.github) return chalk.dim('GitHub: unknown')
  const state = runner.github.status === 'online' ? chalk.green('online') : chalk.yellow(runner.github.status)
  return `GitHub: ${state}${runner.github.busy ? chalk.cyan(' (busy)') : ''}`
}

export function printRunner(log: (message?: string) => void, runner: RunnerInfo): void {
  const local = runner.running
    ? chalk.green('running')
    : chalk.yellow(runner.serviceInstalled ? 'stopped' : 'no service')
  log(`${chalk.bold(`${runner.org}/${runner.name}`)}  ${local}  ${githubState(runner)}`)
  if (runner.github && runner.github.labels.length > 0) log(chalk.dim(`  labels: ${runner.github.labels.join(', ')}`))
  log(chalk.dim(`  ${runner.path}`))
}
