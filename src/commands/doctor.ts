import {Flags} from '@oclif/core'
import chalk from 'chalk'
import {BaseCommand} from '../cli/base-command.js'
import {type DoctorReport, type RepoAtRisk, runDoctor} from '../core/doctor.js'

export default class Doctor extends BaseCommand {
  static override description = 'Check whether anything would be lost if this machine were wiped'
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --offline']
  static override flags = {
    offline: Flags.boolean({description: 'Skip GitHub PR lookups (faster, less precise)'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Doctor)

    this.log(chalk.bold('\n🦥 dotsloth doctor — pre-reinstall check\n'))

    const report = await runDoctor({offline: flags.offline}, (event) => {
      if (event.type === 'start') {
        this.log(chalk.dim(`Scanning ${event.repoCount} repos under ${event.githubRoot}...`))
        if (!event.offline) this.log(chalk.dim('Classifying unpushed branches via GitHub (use --offline to skip)'))
        this.log('')
      } else if (event.repo) {
        // Report repos at risk as soon as they are checked: a full scan takes a while.
        this.printRepo(event.repo)
      }
    })

    this.printEnvAndIcloud(report)

    if (report.safe) {
      this.log(chalk.bold.green('✓ Safe to wipe — everything is pushed or backed up'))
      this.log('')
      return
    }

    this.log(chalk.bold.red(`✗ ${report.problems} area(s) need attention before wiping`))
    this.log('')
    this.exit(1)
  }

  private printEnvAndIcloud(report: DoctorReport): void {
    if (report.envFiles.length > 0) {
      this.log(chalk.bold('Env files'))
      for (const entry of report.envFiles) {
        this.log(chalk.red('  ✗') + ` ${entry.key} ${chalk.dim(`(${entry.state})`)}`)
      }

      this.log(chalk.dim('      → dotsloth env push'))
      this.log('')
    }

    if (report.icloudPending > 0) {
      this.log(chalk.bold('iCloud'))
      this.log(chalk.red('  ✗') + ` ${report.icloudPending} file(s) not yet uploaded`)
      this.log(chalk.dim('      A file in the iCloud folder is not a backup until it has uploaded.'))
      this.log(chalk.dim('      → brctl log --wait --shorten'))
      this.log('')
    }
  }

  private printRepo(repo: RepoAtRisk): void {
    this.log(chalk.bold(repo.relativePath))

    if (repo.dirty > 0) {
      this.log(chalk.red('  ✗') + ` ${repo.dirty} uncommitted change(s)` + chalk.dim('  → git add -A && git commit'))
    }

    if (repo.stashes > 0) {
      this.log(
        chalk.red('  ✗') + ` ${repo.stashes} stash(es)` + chalk.dim('  → git stash show -p stash@{0} > backup.patch'),
      )
    }

    for (const branch of repo.branches) {
      const marker = branch.risk === 'local-only' ? chalk.red('  ✗') : chalk.yellow('  !')
      const gone = branch.upstreamGone ? chalk.dim(' [upstream deleted]') : ''
      this.log(`${marker} ${branch.name}: ${branch.unpushed} unpushed${gone}` + chalk.dim(`  (${branch.reason})`))
      this.log(chalk.dim(`      → git push -u origin ${branch.name}`))
    }

    this.log('')
  }
}
