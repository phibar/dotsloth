import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {expect} from 'chai'
import {getDaemonStatus, installDaemon, uninstallDaemon} from '../../src/core/daemon.js'
import {PLIST_PATH} from '../../src/lib/daemon.js'
import {codeOfCall as codeOf} from '../__testdata__/repos.js'
import {fakeBinaries, resetHome} from '../helpers.js'

describe('core/daemon', () => {
  let restorePath: () => void
  let launchctlLog: string

  beforeEach(() => {
    resetHome()
    launchctlLog = path.join(os.homedir(), 'launchctl.log')
    restorePath = fakeBinaries({launchctl: `echo "$@" >> '${launchctlLog}'`})
  })

  afterEach(() => restorePath())

  it('is not installed in a fresh HOME', () => {
    expect(getDaemonStatus()).to.include({installed: false, intervalSeconds: null, loaded: false})
    expect(uninstallDaemon()).to.deep.equal({removed: false})
  })

  it('rejects intervals below a minute before touching launchd', () => {
    expect(codeOf(() => installDaemon({intervalSeconds: 59}))).to.equal('INVALID_INPUT')
    expect(codeOf(() => installDaemon({intervalSeconds: 90.5}))).to.equal('INVALID_INPUT')
    expect(fs.existsSync(PLIST_PATH)).to.equal(false)
    expect(fs.existsSync(launchctlLog)).to.equal(false)
  })

  it('installs, reports and uninstalls the agent', () => {
    const result = installDaemon({intervalSeconds: 3600})
    expect(result.plistPath).to.equal(PLIST_PATH)
    expect(fs.readFileSync(PLIST_PATH, 'utf8')).to.include('bin/run.js')

    const status = getDaemonStatus()
    expect(status).to.include({installed: true, intervalSeconds: 3600, loaded: true})
    expect(fs.readFileSync(launchctlLog, 'utf8')).to.include('bootstrap')

    expect(uninstallDaemon()).to.deep.equal({removed: true})
    expect(fs.existsSync(PLIST_PATH)).to.equal(false)
  })
})
