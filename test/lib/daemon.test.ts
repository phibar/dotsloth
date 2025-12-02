import {expect} from 'chai'

import {formatInterval, parseInterval} from '../../src/lib/daemon.js'
import {DEFAULT_SYNC_INTERVAL_MS} from '../../src/types/index.js'

describe('daemon', () => {
  describe('parseInterval', () => {
    it('should parse hours correctly', () => {
      expect(parseInterval('1h')).to.equal(60 * 60 * 1000)
      expect(parseInterval('12h')).to.equal(12 * 60 * 60 * 1000)
      expect(parseInterval('24h')).to.equal(24 * 60 * 60 * 1000)
    })

    it('should parse days correctly', () => {
      expect(parseInterval('1d')).to.equal(24 * 60 * 60 * 1000)
      expect(parseInterval('7d')).to.equal(7 * 24 * 60 * 60 * 1000)
    })

    it('should handle uppercase units', () => {
      expect(parseInterval('1H')).to.equal(60 * 60 * 1000)
      expect(parseInterval('1D')).to.equal(24 * 60 * 60 * 1000)
    })

    it('should throw for invalid format', () => {
      expect(() => parseInterval('invalid')).to.throw('Invalid interval format')
      expect(() => parseInterval('1m')).to.throw('Invalid interval format')
      expect(() => parseInterval('24')).to.throw('Invalid interval format')
    })
  })

  describe('formatInterval', () => {
    it('should format hours correctly', () => {
      expect(formatInterval(60 * 60 * 1000)).to.equal('1h')
      expect(formatInterval(12 * 60 * 60 * 1000)).to.equal('12h')
    })

    it('should format days correctly', () => {
      expect(formatInterval(24 * 60 * 60 * 1000)).to.equal('1d')
      expect(formatInterval(7 * 24 * 60 * 60 * 1000)).to.equal('7d')
    })
  })

  describe('DEFAULT_SYNC_INTERVAL_MS', () => {
    it('should be 24 hours', () => {
      expect(DEFAULT_SYNC_INTERVAL_MS).to.equal(24 * 60 * 60 * 1000)
    })
  })
})
