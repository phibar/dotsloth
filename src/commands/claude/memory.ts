import {Args, Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import * as fs from 'node:fs'

import {
  copyFile,
  isIndex,
  MEMORY_STORE,
  memorySetFor,
  mergeIndex,
  stateOf,
  writeFile,
} from '../../lib/claude-memory.js'
import {discoverProjects} from '../../lib/claude-projects.js'
import {loadConfig} from '../../lib/config.js'
import {PATHS} from '../../lib/paths.js'

export default class ClaudeMemory extends Command {
  static override args = {
    direction: Args.string({
      default: 'status',
      description: 'status | push | pull',
      options: ['status', 'push', 'pull'],
    }),
  }
static override description = 'Share Claude Code project memory between machines'
static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> push',
    '<%= config.bin %> <%= command.id %> pull',
  ]
static override flags = {
    'dry-run': Flags.boolean({description: 'Show what would change without writing'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(ClaudeMemory)
    const config = loadConfig()
    const githubRoot = config?.paths.githubRoot ?? PATHS.githubRoot

    const projects = discoverProjects(githubRoot)
    this.log(chalk.bold(`\n🦥 claude memory — ${args.direction}\n`))
    this.log(chalk.dim(`Store: ${MEMORY_STORE}`))
    this.log('')

    let changed = 0
    let unkeyed = 0

    for (const project of projects) {
      const set = memorySetFor(project)
      if (!set) {
        unkeyed++
        continue
      }

      if (set.files.length === 0) continue

      this.log(chalk.bold(set.key))

      for (const file of set.files) {
        const state = stateOf(file)
        if (state === 'identical') continue

        const label = `  ${file.name.padEnd(38)} `

        if (args.direction === 'status') {
          this.log(label + chalk.yellow(state))
          changed++
          continue
        }

        const wantPush = args.direction === 'push'
        const source = wantPush ? file.localPath : file.storePath
        const dest = wantPush ? file.storePath : file.localPath

        if (!fs.existsSync(source)) {
          this.log(label + chalk.dim('nothing to copy'))
          continue
        }

        if (flags['dry-run']) {
          this.log(label + chalk.dim(`would ${args.direction}`))
          changed++
          continue
        }

        // MEMORY.md is the one shared index both machines append to, so it is
        // merged rather than overwritten; everything else is one fact per file
        // and copies cleanly.
        if (isIndex(file) && state === 'differs') {
          const merged = mergeIndex(
            fs.existsSync(file.localPath) ? fs.readFileSync(file.localPath, 'utf8') : '',
            fs.existsSync(file.storePath) ? fs.readFileSync(file.storePath, 'utf8') : '',
          )
          writeFile(file.localPath, merged)
          writeFile(file.storePath, merged)
          this.log(label + chalk.cyan('merged index'))
        } else {
          copyFile(source, dest)
          this.log(label + chalk.green(args.direction === 'push' ? 'pushed' : 'pulled'))
        }

        changed++
      }
    }

    this.log('')
    this.log(`${changed} file(s) ${args.direction === 'status' ? 'out of sync' : 'changed'}`)
    if (unkeyed > 0) {
      this.log(chalk.dim(`${unkeyed} project(s) skipped — no git remote to key them by`))
    }

    this.log('')
  }
}
