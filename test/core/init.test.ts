import * as fs from 'node:fs'
import * as path from 'node:path'
import {expect} from 'chai'
import type {StepEvent} from '../../src/core/events.js'
import {getInitPlan, runInit} from '../../src/core/init.js'
import {getDefaultConfig, readConfig} from '../../src/lib/config.js'
import {getIcloudDotfilePath, PATHS} from '../../src/lib/paths.js'
import {codeOf as asyncCodeOf, codeOfCall as codeOf} from '../__testdata__/repos.js'
import {EMPTY_SYSTEM, fakeBinaries, resetHome} from '../helpers.js'

/**
 * Purpose: a new machine reaches the state dotsloth keeps, every step
 * reported, an existing config kept and local dotfiles backed up; it
 * stops without iCloud Drive or a user name, and replaces a broken
 * config only with --force.
 *
 * Intention: EMPTY_SYSTEM's stand-ins answer for security, ssh-add,
 * osascript and launchctl; the throwaway HOME is reset with or without
 * iCloud Drive.
 */

function writeRawConfig(content: string): void {
  fs.mkdirSync(path.dirname(PATHS.icloudConfig), {recursive: true})
  fs.writeFileSync(PATHS.icloudConfig, content, 'utf8')
}

describe('core/init', () => {
  let restorePath: () => void

  beforeEach(() => {
    resetHome()
    restorePath = fakeBinaries(EMPTY_SYSTEM)
  })

  afterEach(() => restorePath())

  it('plans the questions to ask', () => {
    fs.writeFileSync(PATHS.zprofile, 'export OPENAI_API_KEY=sk-123\nexport PATH=/bin\n', 'utf8')
    expect(getInitPlan()).to.deep.equal({
      configExists: false,
      needsUserName: true,
      secretsInZprofile: 1,
      sshKeyPath: null,
    })
  })

  it('sets the machine up and reports every step', async () => {
    const events: StepEvent[] = []
    const returned = await runInit({userName: 'Sloth'}, (event) => events.push(event))

    expect(returned).to.deep.equal(events)
    expect(readConfig()).to.deep.equal(getDefaultConfig())
    expect(fs.readFileSync(getIcloudDotfilePath('gitconfig'), 'utf8')).to.include('Sloth')
    expect(fs.readFileSync(getIcloudDotfilePath('zprofile'), 'utf8')).to.include('dotsloth secret load')
    expect(fs.readlinkSync(PATHS.gitconfig)).to.equal(getIcloudDotfilePath('gitconfig'))
    expect(fs.existsSync(PATHS.githubRoot)).to.equal(true)

    const labels = events.map((e) => ('label' in e ? e.label : `link:${e.result.target}`))
    expect(labels).to.include.members(['Created new configuration', 'Creating symlinks...', `link:${PATHS.gitconfig}`])
    expect(events.some((e) => e.type === 'step' && e.status === 'warning')).to.equal(true) // no public key in the test HOME
  })

  it('keeps an existing config and backs up local dotfiles it replaces', async () => {
    fs.writeFileSync(PATHS.gitconfig, '[user]\n  name = before\n', 'utf8')
    await runInit({userName: 'Sloth'})
    const events = await runInit({userName: 'ignored'})

    expect(events.some((e) => e.type === 'step' && e.label === 'Existing configuration found')).to.equal(true)
    const backups = fs.readdirSync(PATHS.home).filter((f) => f.startsWith('.gitconfig.backup.'))
    expect(backups).to.have.length(1)
  })

  it('refuses to proceed without iCloud Drive', async () => {
    resetHome({icloud: false})
    expect(codeOf(() => getInitPlan())).to.equal('ICLOUD_UNAVAILABLE')
    expect(await asyncCodeOf(runInit({userName: 'Sloth'}))).to.equal('ICLOUD_UNAVAILABLE')
  })

  it('does not silently replace a broken config - only --force does', async () => {
    writeRawConfig('{"version": 1,')
    expect(codeOf(() => getInitPlan())).to.equal('CONFIG_INVALID')
    expect(await asyncCodeOf(runInit({userName: 'Sloth'}))).to.equal('CONFIG_INVALID')

    await runInit({force: true, userName: 'Sloth'})
    expect(readConfig()).to.deep.equal(getDefaultConfig())
  })

  it('needs a user name while there is no organization', async () => {
    expect(await asyncCodeOf(runInit({}))).to.equal('INVALID_INPUT')
  })
})
