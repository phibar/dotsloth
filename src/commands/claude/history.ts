import * as fs from 'node:fs'
import {Args, Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {
  ACTIVE_SESSION_MINUTES,
  copySession,
  DEFAULT_RETENTION_DAYS,
  HISTORY_FILE,
  HISTORY_STORE,
  mergeHistory,
  readIfExists,
  SHARED_HISTORY,
  sessionFiles,
  writeAtomic,
} from '../../lib/claude-history.js'
import {discoverProjects} from '../../lib/claude-projects.js'
import {loadConfig} from '../../lib/config.js'
import {PATHS} from '../../lib/paths.js'

export default class ClaudeHistory extends Command {
  static override args = {
    direction: Args.string({
      default: 'status',
      description: 'status | push | pull',
      options: ['status', 'push', 'pull'],
    }),
  }
  static override description = 'Share Claude Code conversation history between machines'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> push',
    '<%= config.bin %> <%= command.id %> pull --retention 30',
  ]
  static override flags = {
    'dry-run': Flags.boolean({description: 'Show what would change without writing'}),
    retention: Flags.integer({
      default: DEFAULT_RETENTION_DAYS,
      description: 'Only sync sessions touched within this many days',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(ClaudeHistory)
    const config = loadConfig()
    const githubRoot = config?.paths.githubRoot ?? PATHS.githubRoot
    const direction = args.direction as 'pull' | 'push' | 'status'

    this.log(chalk.bold(`\n🦥 claude history — ${direction}\n`))
    this.log(chalk.dim(`Store: ${HISTORY_STORE}`))
    this.log('')

    let copied = 0
    let skippedActive = 0
    let skippedOld = 0

    // --- Session files ----------------------------------------------------
    for (const project of discoverProjects(githubRoot)) {
      const files = sessionFiles(project)
      if (files.length === 0) continue

      const interesting = files.filter((f) => {
        if (f.ageDays > flags.retention) {
          skippedOld++
          return false
        }

        // Never touch a file something may still be appending to. A finished
        // session is immutable, which is what makes copying it safe at all.
        if (f.active) {
          skippedActive++
          return false
        }

        return true
      })

      const pending = interesting.filter((f) => {
        const from = direction === 'pull' ? f.storePath : f.localPath
        const to = direction === 'pull' ? f.localPath : f.storePath
        return fs.existsSync(from) && !fs.existsSync(to)
      })

      if (pending.length === 0) continue

      this.log(chalk.bold(project.key ?? project.slug))
      for (const file of pending) {
        if (direction === 'status') {
          this.log(chalk.dim(`  ${file.name}  not in store`))
        } else if (flags['dry-run']) {
          this.log(chalk.dim(`  would ${direction} ${file.name}`))
        } else {
          copySession(file, direction)
          this.log(chalk.green('  ✓') + ` ${file.name}`)
        }

        copied++
      }
    }

    // --- The shared append log --------------------------------------------
    this.log('')
    this.log(chalk.bold('history.jsonl'))

    const local = readIfExists(HISTORY_FILE)
    const stored = readIfExists(SHARED_HISTORY)
    const localLines = local.split('\n').filter(Boolean).length
    const storeLines = stored.split('\n').filter(Boolean).length

    if (direction === 'status') {
      this.log(chalk.dim(`  local: ${localLines} entries, store: ${storeLines} entries`))
      const merged = mergeHistory(local, stored).split('\n').filter(Boolean).length
      this.log(chalk.dim(`  merged would be: ${merged} entries`))
    } else if (flags['dry-run']) {
      const merged = mergeHistory(local, stored).split('\n').filter(Boolean).length
      this.log(chalk.dim(`  would merge ${localLines} + ${storeLines} -> ${merged} entries`))
    } else {
      // Merge rather than copy in either direction: this file is the one both
      // machines append to, so a plain overwrite always loses one side.
      const merged = mergeHistory(local, stored)
      writeAtomic(SHARED_HISTORY, merged)
      if (direction === 'pull') {
        writeAtomic(HISTORY_FILE, merged)
      }

      this.log(
        chalk.green('  ✓') + ` merged ${localLines} + ${storeLines} -> ${merged.split('\n').filter(Boolean).length}`,
      )
    }

    this.log('')
    this.log(`${copied} session file(s) ${direction === 'status' ? 'out of sync' : 'copied'}`)
    if (skippedActive > 0) {
      this.log(chalk.yellow(`${skippedActive} skipped — modified in the last ${ACTIVE_SESSION_MINUTES}m (still live)`))
    }

    if (skippedOld > 0) {
      this.log(chalk.dim(`${skippedOld} skipped — older than ${flags.retention} days`))
    }

    this.log('')
  }
}
