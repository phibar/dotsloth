import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {expect} from 'chai'

import {ConfigError, getDefaultConfig, loadConfig, readConfig, saveConfig} from '../../src/lib/config.js'
import {PATHS} from '../../src/lib/paths.js'
import {createSymlink} from '../../src/lib/symlink.js'
import type {DevSlothConfig} from '../../src/types/index.js'

const withOrg = (): DevSlothConfig => ({
  ...getDefaultConfig(),
  organizations: [{folderName: 'acme', gitEmail: 'dev@acme.test', gitUsername: 'dev', name: 'acme'}],
})

describe('config access', () => {
  beforeEach(() => {
    // test/setup.ts points HOME at a temp dir; make sure that held.
    expect(PATHS.icloudConfig.startsWith(os.homedir())).to.equal(true)
    expect(os.homedir()).to.include('dotsloth-home-')
    fs.rmSync(PATHS.icloudDotsloth, {force: true, recursive: true})
  })

  it('readConfig returns null when there is no config', () => {
    expect(readConfig()).to.equal(null)
    expect(loadConfig()).to.equal(null)
  })

  it('round-trips through saveConfig and readConfig', () => {
    saveConfig(withOrg())
    expect(readConfig()).to.deep.equal(withOrg())
  })

  it('readConfig never writes - not even the org gitconfigs', () => {
    saveConfig(withOrg())
    readConfig()
    expect(fs.existsSync(PATHS.icloudOrganizations)).to.equal(false)
  })

  it('loadConfig still regenerates the org gitconfigs for the CLI', () => {
    saveConfig(withOrg())
    loadConfig()
    expect(fs.readFileSync(path.join(PATHS.icloudOrganizations, 'acme.gitconfig'), 'utf8')).to.include('dev@acme.test')
  })

  it('throws ConfigError for a file that is not JSON instead of reporting "no config"', () => {
    fs.mkdirSync(path.dirname(PATHS.icloudConfig), {recursive: true})
    fs.writeFileSync(PATHS.icloudConfig, '{"version": 1,', 'utf8')
    expect(() => readConfig()).to.throw(ConfigError, /not valid JSON/)
  })

  it('throws ConfigError listing every schema problem', () => {
    fs.mkdirSync(path.dirname(PATHS.icloudConfig), {recursive: true})
    const broken = {
      ...withOrg(),
      organizations: [{...withOrg().organizations[0], gitEmail: 'not-an-email'}],
      version: 2,
    }
    fs.writeFileSync(PATHS.icloudConfig, JSON.stringify(broken), 'utf8')

    try {
      readConfig()
      expect.fail('should have thrown')
    } catch (error) {
      expect(error).to.be.instanceOf(ConfigError)
      const {issues} = error as ConfigError
      expect(issues.some((i) => i.startsWith('organizations.0.gitEmail:'))).to.equal(true)
      expect(issues.some((i) => i.startsWith('version:'))).to.equal(true)
    }
  })

  it('saveConfig refuses an invalid config and leaves the file untouched', () => {
    saveConfig(withOrg())
    const before = fs.readFileSync(PATHS.icloudConfig, 'utf8')

    const invalid = {...withOrg(), sshSigning: {defaultKeyPath: 1}} as unknown as DevSlothConfig
    expect(() => saveConfig(invalid)).to.throw(ConfigError)
    expect(fs.readFileSync(PATHS.icloudConfig, 'utf8')).to.equal(before)
  })

  it('saveConfig leaves no temp file behind', () => {
    saveConfig(withOrg())
    expect(fs.readdirSync(path.dirname(PATHS.icloudConfig))).to.deep.equal(['config.json'])
  })
})

describe('createSymlink output', () => {
  it('reports the backup path instead of printing it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-link-'))
    const source = path.join(dir, 'source')
    const target = path.join(dir, 'target')
    fs.writeFileSync(source, 'from icloud', 'utf8')
    fs.writeFileSync(target, 'existing local file', 'utf8')

    const logged: unknown[] = []
    const original = console.log
    console.log = (...args: unknown[]) => logged.push(args)
    try {
      const result = await createSymlink({backup: true, source, target})
      expect(result.isValid).to.equal(true)
      expect(result.backupPath).to.match(/target\.backup\.\d+$/)
      expect(fs.readFileSync(result.backupPath as string, 'utf8')).to.equal('existing local file')
      expect(fs.readlinkSync(target)).to.equal(source)
    } finally {
      console.log = original
      fs.rmSync(dir, {force: true, recursive: true})
    }

    expect(logged).to.deep.equal([])
  })
})
