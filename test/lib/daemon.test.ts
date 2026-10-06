import {expect} from 'chai'

import {DAEMON_LABEL, generatePlist, isVersionedNodePath} from '../../src/lib/daemon.js'

describe('daemon plist', () => {
  const plist = generatePlist({binPath: '/opt/dotsloth/bin/run.js', intervalSeconds: 3600, nodePath: '/usr/bin/node'})

  it('declares the label and interval', () => {
    expect(plist).to.include(DAEMON_LABEL)
    expect(plist).to.include('<integer>3600</integer>')
  })

  it('runs at load, so a sleeping laptop still syncs', () => {
    // launchd does not queue a StartInterval job missed while asleep.
    expect(plist).to.include('<key>RunAtLoad</key>')
    expect(plist).to.include('<true/>')
  })

  it('names an absolute node and script, since launchd has no PATH', () => {
    expect(plist).to.include('<string>/usr/bin/node</string>')
    expect(plist).to.include('<string>/opt/dotsloth/bin/run.js</string>')
  })

  it('escapes XML metacharacters in paths', () => {
    const escaped = generatePlist({binPath: '/tmp/a&b/run.js', nodePath: '/usr/bin/node'})
    expect(escaped).to.include('a&amp;b')
    expect(escaped).to.not.include('a&b/')
  })
})

describe('isVersionedNodePath', () => {
  it('flags version-manager paths that vanish on upgrade', () => {
    expect(isVersionedNodePath('/Users/x/.nvm/versions/node/v24.12.0/bin/node')).to.equal(true)
    expect(isVersionedNodePath('/Users/x/.fnm/node-versions/v20/bin/node')).to.equal(true)
    expect(isVersionedNodePath('/Users/x/.volta/tools/image/node/20/bin/node')).to.equal(true)
  })

  it('accepts stable system paths', () => {
    expect(isVersionedNodePath('/opt/homebrew/bin/node')).to.equal(false)
    expect(isVersionedNodePath('/usr/local/bin/node')).to.equal(false)
    expect(isVersionedNodePath('/usr/bin/node')).to.equal(false)
  })
})
