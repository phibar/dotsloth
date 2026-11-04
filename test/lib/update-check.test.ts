/*
 * Purpose: Pin the promises of src/lib/update-check.ts.
 * Intention: uses a temp state file via the fake HOME from test/setup.ts.
 */

import {expect} from 'chai'
import {readState, saveUpdateCheckState} from '../../src/lib/state.js'
import {checkForUpdate} from '../../src/lib/update-check.js'

describe('update-check', () => {
  describe('checkForUpdate', () => {
    it('returns null when the cached version matches current', async () => {
      saveUpdateCheckState({checkedAt: new Date().toISOString(), latestVersion: '1.0.0'})
      const result = await checkForUpdate('1.0.0')
      expect(result).to.equal(null)
    })

    it('returns update info when the cached version is newer', async () => {
      saveUpdateCheckState({checkedAt: new Date().toISOString(), latestVersion: '1.1.0'})
      const result = await checkForUpdate('1.0.0')
      expect(result).to.deep.equal({current: '1.0.0', latest: '1.1.0'})
    })

    it('returns null when the cached version is older than current', async () => {
      saveUpdateCheckState({checkedAt: new Date().toISOString(), latestVersion: '0.9.0'})
      const result = await checkForUpdate('1.0.0')
      expect(result).to.equal(null)
    })

    it('compares patch versions correctly', async () => {
      saveUpdateCheckState({checkedAt: new Date().toISOString(), latestVersion: '1.0.10'})
      const result = await checkForUpdate('1.0.9')
      expect(result).to.deep.equal({current: '1.0.9', latest: '1.0.10'})
    })

    it('uses the cache when it is fresh', async () => {
      saveUpdateCheckState({checkedAt: new Date().toISOString(), latestVersion: '2.0.0'})
      await checkForUpdate('1.0.0')
      // checkedAt stays unchanged — a fresh cache is not re-fetched
      const state = readState()
      expect(state.updateCheck?.latestVersion).to.equal('2.0.0')
    })
  })
})
