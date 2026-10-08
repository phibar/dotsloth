import * as fs from 'node:fs'
import * as path from 'node:path'
import {expect} from 'chai'
import {replaceConfig, updateConfig} from '../../src/core/config.js'
import {CoreError} from '../../src/core/errors.js'
import type {StepEvent} from '../../src/core/events.js'
import {getInitPlan, runInit} from '../../src/core/init.js'
import {getStatus} from '../../src/core/status.js'
import {getDefaultConfig, readConfig} from '../../src/lib/config.js'
import {getIcloudDotfilePath, PATHS} from '../../src/lib/paths.js'
import {EMPTY_SYSTEM, fakeBinaries, resetHome} from '../helpers.js'

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    return (error as CoreError).code
  }

  return undefined
}

async function asyncCodeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise
  } catch (error) {
    return (error as CoreError).code
  }

  return undefined
}

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

describe('core/status', () => {
  let restorePath: () => void

  beforeEach(() => {
    resetHome()
    restorePath = fakeBinaries({...EMPTY_SYSTEM, 'ssh-add': 'echo "256 SHA256:abc key (ED25519)"'})
  })

  afterEach(() => restorePath())

  it('reports iCloud as unavailable without reading anything else', () => {
    resetHome({icloud: false})
    const status = getStatus()
    expect(status.icloud.accessible).to.equal(false)
    expect(status.config).to.include({exists: false, value: null})
  })

  it('reports a missing config', () => {
    expect(getStatus().config).to.include({exists: false, value: null})
  })

  it('lists config problems instead of failing', () => {
    writeRawConfig(JSON.stringify({...getDefaultConfig(), version: 7}))
    const {config} = getStatus()
    expect(config.exists).to.equal(true)
    expect(config.value).to.equal(null)
    expect(config.errors?.[0]).to.match(/^version:/)
  })

  it('returns the config, symlinks, keys and the org of a directory - and writes nothing', () => {
    const config = {
      ...getDefaultConfig(),
      organizations: [{folderName: 'acme', gitEmail: 'dev@acme.test', gitUsername: 'dev', name: 'acme'}],
    }
    replaceConfig(config)

    const status = getStatus({directory: path.join(PATHS.githubRoot, 'acme', 'repo')})
    expect(status.config.value).to.deep.equal(config)
    expect(status.symlinks.map((s) => s.target)).to.deep.equal(config.syncedFiles.map((f) => f.target))
    expect(status.sshKeys).to.deep.equal(['256 SHA256:abc key (ED25519)'])
    expect(status.secrets.names).to.deep.equal([])
    expect(status.directory?.org?.name).to.equal('acme')
    expect(fs.existsSync(PATHS.icloudOrganizations)).to.equal(false)
  })
})

describe('core/config', () => {
  beforeEach(() => resetHome())

  it('replaceConfig rejects invalid input with field-level details and keeps the file', () => {
    replaceConfig(getDefaultConfig())
    try {
      replaceConfig({...getDefaultConfig(), paths: {}})
      expect.fail('should have thrown')
    } catch (error) {
      expect((error as CoreError).code).to.equal('INVALID_INPUT')
      expect((error as CoreError).details[0]).to.match(/^paths\.githubRoot:/)
    }

    expect(readConfig()).to.deep.equal(getDefaultConfig())
  })

  it('updateConfig applies a change without mutating the original', () => {
    replaceConfig(getDefaultConfig())
    const updated = updateConfig((config) => ({...config, sshSigning: {...config.sshSigning, enabled: false}}))
    expect(updated.sshSigning.enabled).to.equal(false)
    expect(readConfig()?.sshSigning.enabled).to.equal(false)
  })
})
