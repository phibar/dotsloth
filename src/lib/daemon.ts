import * as fs from 'node:fs'
import {dirname} from 'node:path'

import {type DaemonState, DEFAULT_SYNC_INTERVAL_MS} from '../types/index.js'
import {PATHS} from './paths.js'

const DAEMON_STATE_FILE = PATHS.localState

/**
 * Get default daemon state
 */
export function getDefaultDaemonState(): DaemonState {
  return {
    intervalMs: DEFAULT_SYNC_INTERVAL_MS,
    lastSyncTime: null,
    pid: null,
    running: false,
    startedAt: null,
  }
}

/**
 * Load daemon state from disk
 */
export function loadDaemonState(): DaemonState {
  if (!fs.existsSync(DAEMON_STATE_FILE)) {
    return getDefaultDaemonState()
  }

  try {
    const content = fs.readFileSync(DAEMON_STATE_FILE, 'utf8')
    const data = JSON.parse(content) as Partial<DaemonState>
    return {
      ...getDefaultDaemonState(),
      ...data,
    }
  } catch {
    return getDefaultDaemonState()
  }
}

/**
 * Save daemon state to disk
 */
export function saveDaemonState(state: DaemonState): void {
  fs.mkdirSync(dirname(DAEMON_STATE_FILE), {recursive: true})
  fs.writeFileSync(DAEMON_STATE_FILE, JSON.stringify(state, null, 2), 'utf8')
}

/**
 * Check if a process with the given PID is running
 */
export function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Check if daemon is actually running
 */
export function isDaemonRunning(): boolean {
  const state = loadDaemonState()
  if (!state.running || state.pid === null) {
    return false
  }

  return isProcessRunning(state.pid)
}

/**
 * Update daemon state with new sync time
 */
export function updateLastSyncTime(): void {
  const state = loadDaemonState()
  state.lastSyncTime = new Date().toISOString()
  saveDaemonState(state)
}

/**
 * Mark daemon as started
 */
export function markDaemonStarted(pid: number, intervalMs: number): void {
  const state = loadDaemonState()
  state.pid = pid
  state.running = true
  state.startedAt = new Date().toISOString()
  state.intervalMs = intervalMs
  saveDaemonState(state)
}

/**
 * Mark daemon as stopped
 */
export function markDaemonStopped(): void {
  const state = loadDaemonState()
  state.pid = null
  state.running = false
  saveDaemonState(state)
}

/**
 * Parse interval string to milliseconds
 * Supports: 1h, 2h, 12h, 24h, 1d, etc.
 */
export function parseInterval(interval: string): number {
  const match = /^(\d+)(h|d)$/i.exec(interval.trim())
  if (!match) {
    throw new Error(`Invalid interval format: ${interval}. Use format like '1h', '12h', '24h', or '1d'`)
  }

  const value = Number.parseInt(match[1], 10)
  const unit = match[2].toLowerCase()

  if (unit === 'h') {
    return value * 60 * 60 * 1000
  }

  if (unit === 'd') {
    return value * 24 * 60 * 60 * 1000
  }

  throw new Error(`Invalid interval unit: ${unit}`)
}

/**
 * Format milliseconds to human-readable interval.
 * Rounds to the nearest whole hour or day.
 */
export function formatInterval(ms: number): string {
  const hours = ms / (60 * 60 * 1000)
  if (hours >= 24 && hours % 24 === 0) {
    return `${hours / 24}d`
  }

  return `${Math.round(hours)}h`
}
