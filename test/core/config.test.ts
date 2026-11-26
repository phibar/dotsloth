import {expect} from 'chai'
import {replaceConfig, updateConfig} from '../../src/core/config.js'
import {CoreError} from '../../src/core/errors.js'
import {getDefaultConfig, readConfig} from '../../src/lib/config.js'
import {resetHome} from '../helpers.js'

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
