import {expect} from 'chai'
import {readState, saveUpdateCheckState} from '../../src/lib/state.js'
import {checkForUpdate} from '../../src/lib/update-check.js'

/**
 * Purpose: a newer release is reported only when it is newer than this
 * one, from a cache under a day old unless a fresh answer is asked for.
 *
 * Intention: the cache is the state file in the throwaway HOME; fetch
 * is replaced where npm is asked.
 */
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

    it('asks npm despite a fresh cache when asked for fresh, and refreshes the cache', async () => {
      saveUpdateCheckState({checkedAt: new Date().toISOString(), latestVersion: '1.0.0'})
      const original = globalThis.fetch
      globalThis.fetch = (async () => new Response(JSON.stringify({version: '1.1.0'}))) as typeof fetch
      try {
        const result = await checkForUpdate('1.0.0', {fresh: true})
        expect(result).to.deep.equal({current: '1.0.0', latest: '1.1.0'})
        expect(readState().updateCheck?.latestVersion).to.equal('1.1.0')
      } finally {
        globalThis.fetch = original
      }
    })
  })
})
