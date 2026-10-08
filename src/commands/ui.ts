import {Flags} from '@oclif/core'
import chalk from 'chalk'
import {BaseCommand} from '../cli/base-command.js'
import {tryRun} from '../lib/exec.js'
import {startServer} from '../server/index.js'

export default class Ui extends BaseCommand {
  static override description = 'Manage dotsloth in the browser (local web interface)'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --port 4321 --no-open',
  ]
  static override flags = {
    open: Flags.boolean({allowNo: true, default: true, description: 'Open the browser'}),
    port: Flags.integer({default: 0, description: 'Port to listen on (default: a free one)', max: 65_535, min: 0}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Ui)

    const server = await startServer({port: flags.port})

    this.log(chalk.bold('\n🦥 dotsloth ui\n'))
    this.log(`  ${chalk.cyan(server.url)}`)
    this.log('')
    this.log(chalk.dim('  Listening on 127.0.0.1 only. The link signs your browser in - do not share it.'))
    this.log(chalk.dim('  Press Ctrl+C to stop.'))
    this.log('')

    if (flags.open && tryRun('open', [server.url]) === null) {
      this.log(chalk.yellow('!') + ' Could not open the browser - open the link above yourself.')
    }

    await new Promise<void>((resolve) => {
      process.once('SIGINT', resolve)
      process.once('SIGTERM', resolve)
    })

    await server.close()
    this.log(chalk.dim('\nStopped.'))
  }
}
