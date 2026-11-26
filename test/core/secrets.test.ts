import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {expect} from 'chai'
import {listSecretNames, removeSecret, revealSecret, secretExists, setSecret} from '../../src/core/secrets.js'
import {codeOfCall as codeOf} from '../__testdata__/repos.js'
import {FAKE_SECURITY, fakeBinaries, resetHome} from '../helpers.js'

describe('core/secrets', () => {
  let restorePath: () => void

  beforeEach(() => {
    resetHome()
    process.env.FAKE_KEYCHAIN = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-keychain-'))
    restorePath = fakeBinaries({security: FAKE_SECURITY})
  })

  afterEach(() => {
    restorePath()
    fs.rmSync(process.env.FAKE_KEYCHAIN as string, {force: true, recursive: true})
    delete process.env.FAKE_KEYCHAIN
  })

  it('stores, lists, reveals and removes a secret under its upper-case name', () => {
    expect(setSecret('openai_api_key', 'sk-123')).to.deep.equal({created: true, name: 'OPENAI_API_KEY'})
    expect(listSecretNames()).to.deep.equal(['OPENAI_API_KEY'])
    expect(secretExists('OPENAI_API_KEY')).to.equal(true)
    expect(revealSecret('openai_api_key')).to.equal('sk-123')

    expect(removeSecret('OPENAI_API_KEY')).to.deep.equal({name: 'OPENAI_API_KEY'})
    expect(listSecretNames()).to.deep.equal([])
  })

  it('refuses to replace a secret unless asked', () => {
    setSecret('TOKEN', 'old')
    expect(codeOf(() => setSecret('TOKEN', 'new'))).to.equal('CONFLICT')
    expect(revealSecret('TOKEN')).to.equal('old')

    expect(setSecret('TOKEN', 'new', {overwrite: true}).created).to.equal(false)
    expect(revealSecret('TOKEN')).to.equal('new')
  })

  it('keeps hostile values intact', () => {
    const value = '"; touch PWNED; $(whoami) `id`'
    setSecret('HOSTILE', value)
    expect(revealSecret('HOSTILE')).to.equal(value)
  })

  it('rejects bad names and empty values, and reports unknown secrets', () => {
    expect(codeOf(() => setSecret('1BAD', 'x'))).to.equal('INVALID_INPUT')
    expect(codeOf(() => setSecret('WITH SPACE', 'x'))).to.equal('INVALID_INPUT')
    expect(codeOf(() => setSecret('EMPTY', ''))).to.equal('INVALID_INPUT')
    expect(codeOf(() => revealSecret('MISSING'))).to.equal('NOT_FOUND')
    expect(codeOf(() => removeSecret('MISSING'))).to.equal('NOT_FOUND')
  })
})
