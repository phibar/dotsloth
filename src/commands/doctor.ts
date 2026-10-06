import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'

import {loadConfig} from '../lib/config.js'
import {compare, DEFAULT_ENV_PATTERNS, scanAll} from '../lib/env.js'
import {pendingUploads} from '../lib/icloud.js'
import {PATHS} from '../lib/paths.js'
import {auditRepo, findRepos, isAtRisk} from '../lib/repo-audit.js'

export default class Doctor extends Command {
  static override description = 'Check whether anything would be lost if this machine were wiped'
static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --offline',
  ]
static override flags = {
    offline: Flags.boolean({description: 'Skip GitHub PR lookups (faster, less precise)'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Doctor)
    const config = loadConfig()
    const githubRoot = config?.paths.githubRoot ?? PATHS.githubRoot

    this.log(chalk.bold('\n🦥 dotsloth doctor — pre-reinstall check\n'))

    const repos = findRepos(githubRoot)
    this.log(chalk.dim(`Scanning ${repos.length} repos under ${githubRoot}...`))
    if (!flags.offline) {
      this.log(chalk.dim('Classifying unpushed branches via GitHub (use --offline to skip)'))
    }

    this.log('')

    let problems = 0

    // --- Repos -------------------------------------------------------------
    for (const repoPath of repos) {
      const audit = auditRepo(repoPath, {offline: flags.offline})
      if (!isAtRisk(audit)) continue

      problems++
      this.log(chalk.bold(audit.path.replace(githubRoot + '/', '')))

      if (audit.dirty > 0) {
        this.log(chalk.red('  ✗') + ` ${audit.dirty} uncommitted change(s)` + chalk.dim('  → git add -A && git commit'))
      }

      if (audit.stashes > 0) {
        this.log(
          chalk.red('  ✗') +
            ` ${audit.stashes} stash(es)` +
            chalk.dim('  → git stash show -p stash@{0} > backup.patch'),
        )
      }

      for (const branch of audit.branches) {
        if (branch.unpushed === 0 && !branch.upstreamGone) continue
        if (branch.risk === 'merged') continue

        const marker = branch.risk === 'local-only' ? chalk.red('  ✗') : chalk.yellow('  !')
        const gone = branch.upstreamGone ? chalk.dim(' [upstream deleted]') : ''
        this.log(
          `${marker} ${branch.name}: ${branch.unpushed} unpushed${gone}` + chalk.dim(`  (${branch.reason})`),
        )
        this.log(chalk.dim(`      → git push -u origin ${branch.name}`))
      }

      this.log('')
    }

    // --- Env files ---------------------------------------------------------
    const envs = scanAll(githubRoot, DEFAULT_ENV_PATTERNS).map((f) => compare(f))
    const unsavedEnvs = envs.filter((e) => e.state === 'local-only' || e.state === 'differs')
    if (unsavedEnvs.length > 0) {
      problems++
      this.log(chalk.bold('Env files'))
      for (const entry of unsavedEnvs) {
        this.log(
          chalk.red('  ✗') +
            ` ${entry.file.org}/${entry.file.repo}/${entry.file.relativePath} ${chalk.dim(`(${entry.state})`)}`,
        )
      }

      this.log(chalk.dim('      → dotsloth env push'))
      this.log('')
    }

    // --- iCloud ------------------------------------------------------------
    const pending = pendingUploads()
    if (pending.length > 0) {
      problems++
      this.log(chalk.bold('iCloud'))
      this.log(chalk.red('  ✗') + ` ${pending.length} file(s) not yet uploaded`)
      this.log(chalk.dim('      A file in the iCloud folder is not a backup until it has uploaded.'))
      this.log(chalk.dim('      → brctl log --wait --shorten'))
      this.log('')
    }

    // --- Verdict -----------------------------------------------------------
    if (problems === 0) {
      this.log(chalk.bold.green('✓ Safe to wipe — everything is pushed or backed up'))
      this.log('')
      return
    }

    this.log(chalk.bold.red(`✗ ${problems} area(s) need attention before wiping`))
    this.log('')
    this.exit(1)
  }
}
