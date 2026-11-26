import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Config} from '@oclif/core'
import {expect} from 'chai'

import {BaseCommand} from '../../src/cli/base-command.js'

/**
 * Purpose: Ctrl+C in a prompt ends the command as cancelled, while every
 * other error still fails it as before.
 *
 * Intention: runs a command extending BaseCommand through oclif's own run
 * loop, in a bare package root, its run throwing the error @inquirer/prompts rejects with on Ctrl+C,
 * or another; exitCode is restored after each test.
 */
describe('cancelling a prompt', () => {
  class Throwing extends BaseCommand {
    static thrown: Error
    lines: string[] = []

    override log(line = ''): void {
      this.lines.push(line)
    }

    async run(): Promise<void> {
      throw Throwing.thrown
    }
  }

  let config: Config
  before(async () => {
    // A bare package root: the command under test needs a config, and none of the tree's commands.
    const root = mkdtempSync(join(tmpdir(), 'base-command-'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({name: 'base-command-test', version: '0.0.0'}))
    config = await Config.load(root)
  })
  afterEach(() => {
    process.exitCode = undefined
  })

  const cancelled = Object.assign(new Error('User force closed the prompt with SIGINT'), {name: 'ExitPromptError'})

  it('says "Cancelled" and sets exit code 130 when a prompt is closed with Ctrl+C', async () => {
    Throwing.thrown = cancelled
    const command = new Throwing([], config)
    await command._run()
    expect(process.exitCode).to.equal(130)
    expect(command.lines.join('')).to.contain('Cancelled')
  })

  it('fails the command with any other error', async () => {
    const other = new Error('boom')
    Throwing.thrown = other
    const command = new Throwing([], config)
    let caught: unknown
    await command._run().catch((error) => {
      caught = error
    })
    expect(caught).to.equal(other)
    expect(command.lines.join('')).not.to.contain('Cancelled')
  })
})
