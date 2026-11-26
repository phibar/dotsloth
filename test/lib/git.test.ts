import {expect} from 'chai'

import {parseGitUrl} from '../../src/lib/git.js'

describe('parseGitUrl', () => {
  it('parses SSH and HTTPS URLs', () => {
    expect(parseGitUrl('git@github.com:phibar/dotsloth.git')).to.deep.equal({
      host: 'github.com',
      org: 'phibar',
      repo: 'dotsloth',
    })
    expect(parseGitUrl('https://github.com/ipfs/kubo')).to.deep.equal({host: 'github.com', org: 'ipfs', repo: 'kubo'})
  })

  it('rejects anything before, after or inside the address', () => {
    for (const url of [
      '--upload-pack=touch /tmp/PWNED git@github.com:a/b',
      '-c core.sshCommand=x git@github.com:a/b',
      'git@github.com:a/b --upload-pack=x',
      'xhttps://github.com/a/b',
      'https://github.com/a/b c',
    ]) {
      expect(parseGitUrl(url), url).to.equal(null)
    }
  })
})
