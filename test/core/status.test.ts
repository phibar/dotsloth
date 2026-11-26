import * as fs from 'node:fs'
import * as path from 'node:path'
import {expect} from 'chai'
import {replaceConfig} from '../../src/core/config.js'
import {getStatus} from '../../src/core/status.js'
import {getDefaultConfig} from '../../src/lib/config.js'
import {PATHS} from '../../src/lib/paths.js'
import {EMPTY_SYSTEM, fakeBinaries, resetHome} from '../helpers.js'

/**
 * Purpose: status shows whether this machine is in the state dotsloth
 * keeps, reports a missing or broken config instead of failing, and
 * writes nothing.
 *
 * Intention: EMPTY_SYSTEM stands in for the system tools; the config is
 * written into the throwaway HOME.
 */

function writeRawConfig(content: string): void {
  fs.mkdirSync(path.dirname(PATHS.icloudConfig), {recursive: true})
  fs.writeFileSync(PATHS.icloudConfig, content, 'utf8')
}

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
