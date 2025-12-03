import * as fs from 'node:fs'
import * as path from 'node:path'

import {expect} from 'chai'

import {
  formatInterval,
  getDefaultDaemonState,
  isDaemonRunning,
  isProcessRunning,
  loadDaemonState,
  markDaemonStarted,
  markDaemonStopped,
  parseInterval,
  saveDaemonState,
  updateLastSyncTime,
} from '../../src/lib/daemon.js'
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

    it('should round fractional hours', () => {
      expect(formatInterval(90 * 60 * 1000)).to.equal('2h') // 1.5 hours -> 2h
      expect(formatInterval(30 * 60 * 1000)).to.equal('1h') // 0.5 hours -> 1h
    })
  })

  describe('DEFAULT_SYNC_INTERVAL_MS', () => {
    it('should be 24 hours', () => {
      expect(DEFAULT_SYNC_INTERVAL_MS).to.equal(24 * 60 * 60 * 1000)
    })
  })

  describe('isProcessRunning', () => {
    it('should return true for current process', () => {
      expect(isProcessRunning(process.pid)).to.be.true
    })

    it('should return false for non-existent PID', () => {
      // Use a very high PID that's unlikely to exist
      expect(isProcessRunning(99_999_999)).to.be.false
    })
  })

  describe('state management', () => {
    let stateFilePath: string
    let originalState: null | string

    beforeEach(async () => {
      // Get the actual state file path
      const {PATHS} = await import('../../src/lib/paths.js')
      stateFilePath = PATHS.localState
      
      // Backup existing state if it exists
      originalState = fs.existsSync(stateFilePath) ? fs.readFileSync(stateFilePath, 'utf8') : null;
    })

    afterEach(() => {
      // Restore original state or remove test state
      if (originalState) {
        fs.writeFileSync(stateFilePath, originalState, 'utf8')
      } else if (fs.existsSync(stateFilePath)) {
        fs.unlinkSync(stateFilePath)
      }
    })

    describe('getDefaultDaemonState', () => {
      it('should return correct default state', () => {
        const state = getDefaultDaemonState()
        expect(state).to.deep.equal({
          intervalMs: DEFAULT_SYNC_INTERVAL_MS,
          lastSyncTime: null,
          pid: null,
          running: false,
          startedAt: null,
        })
      })
    })

    describe('loadDaemonState', () => {
      it('should return default state when file does not exist', () => {
        // Ensure state file doesn't exist
        if (fs.existsSync(stateFilePath)) {
          fs.unlinkSync(stateFilePath)
        }
        
        const state = loadDaemonState()
        expect(state).to.deep.equal(getDefaultDaemonState())
      })

      it('should load state from existing file', () => {
        const testState = {
          intervalMs: 3_600_000,
          lastSyncTime: '2024-01-01T00:00:00.000Z',
          pid: 1234,
          running: true,
          startedAt: '2024-01-01T00:00:00.000Z',
        }
        fs.mkdirSync(path.dirname(stateFilePath), {recursive: true})
        fs.writeFileSync(stateFilePath, JSON.stringify(testState))

        const state = loadDaemonState()
        expect(state).to.deep.equal(testState)
      })

      it('should merge partial state with defaults', () => {
        const partialState = {pid: 5678, running: true}
        fs.mkdirSync(path.dirname(stateFilePath), {recursive: true})
        fs.writeFileSync(stateFilePath, JSON.stringify(partialState))

        const state = loadDaemonState()
        expect(state.pid).to.equal(5678)
        expect(state.running).to.be.true
        expect(state.intervalMs).to.equal(DEFAULT_SYNC_INTERVAL_MS)
      })

      it('should return default state on corrupted JSON', () => {
        fs.mkdirSync(path.dirname(stateFilePath), {recursive: true})
        fs.writeFileSync(stateFilePath, 'invalid json{')

        const state = loadDaemonState()
        expect(state).to.deep.equal(getDefaultDaemonState())
      })
    })

    describe('saveDaemonState', () => {
      it('should write state to disk', () => {
        const testState = getDefaultDaemonState()
        testState.pid = 1234
        testState.running = true

        saveDaemonState(testState)

        expect(fs.existsSync(stateFilePath)).to.be.true
        const saved = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'))
        expect(saved.pid).to.equal(1234)
        expect(saved.running).to.be.true
      })

      it('should create directory if it does not exist', () => {
        // Delete the state file and its parent directory if they exist
        if (fs.existsSync(stateFilePath)) {
          fs.unlinkSync(stateFilePath)
        }

        const stateDir = path.dirname(stateFilePath)
        if (fs.existsSync(stateDir)) {
          fs.rmSync(stateDir, {recursive: true})
        }

        const testState = getDefaultDaemonState()
        saveDaemonState(testState)

        expect(fs.existsSync(stateDir)).to.be.true
        expect(fs.existsSync(stateFilePath)).to.be.true
      })

      it('should overwrite existing state', () => {
        const state1 = getDefaultDaemonState()
        state1.pid = 1111
        saveDaemonState(state1)

        const state2 = getDefaultDaemonState()
        state2.pid = 2222
        saveDaemonState(state2)

        const loaded = loadDaemonState()
        expect(loaded.pid).to.equal(2222)
      })
    })

    describe('markDaemonStarted', () => {
      it('should set all state fields correctly', () => {
        markDaemonStarted(1234, 3_600_000)

        const state = loadDaemonState()
        expect(state.pid).to.equal(1234)
        expect(state.running).to.be.true
        expect(state.intervalMs).to.equal(3_600_000)
        expect(state.startedAt).to.be.a('string')
      })
    })

    describe('markDaemonStopped', () => {
      it('should set pid to null and running to false', () => {
        markDaemonStarted(1234, 3_600_000)
        markDaemonStopped()

        const state = loadDaemonState()
        expect(state.pid).to.be.null
        expect(state.running).to.be.false
      })
    })

    describe('updateLastSyncTime', () => {
      it('should update lastSyncTime to current timestamp', () => {
        const before = Date.now()
        updateLastSyncTime()
        const after = Date.now()

        const state = loadDaemonState()
        expect(state.lastSyncTime).to.be.a('string')
        const syncTime = new Date(state.lastSyncTime!).getTime()
        expect(syncTime).to.be.at.least(before)
        expect(syncTime).to.be.at.most(after)
      })
    })

    describe('isDaemonRunning', () => {
      it('should return false when state.running is false', () => {
        const state = getDefaultDaemonState()
        saveDaemonState(state)

        expect(isDaemonRunning()).to.be.false
      })

      it('should return false when PID is null', () => {
        const state = getDefaultDaemonState()
        state.running = true
        state.pid = null
        saveDaemonState(state)

        expect(isDaemonRunning()).to.be.false
      })

      it('should return true when daemon is running with valid PID', () => {
        markDaemonStarted(process.pid, 3_600_000)

        expect(isDaemonRunning()).to.be.true
      })

      it('should return false when PID exists in state but process is not running', () => {
        const state = getDefaultDaemonState()
        state.running = true
        state.pid = 99_999_999 // Non-existent PID
        saveDaemonState(state)

        expect(isDaemonRunning()).to.be.false
      })
    })
  })
})
