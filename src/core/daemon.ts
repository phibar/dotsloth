import * as path from 'node:path'
import {fileURLToPath} from 'node:url'

import {
  DEFAULT_INTERVAL_SECONDS,
  findStableNode,
  install,
  isInstalled,
  isLoaded,
  isVersionedNodePath,
  LOG_DIR,
  PLIST_PATH,
  readInterval,
  tailLog,
  uninstall,
} from '../lib/daemon.js'
import {CoreError} from './errors.js'

export const MIN_INTERVAL_SECONDS = 60

export interface DaemonStatus {
  installed: boolean
  intervalSeconds: null | number
  loaded: boolean
  logPath: string
  plistPath: string
  /** The last lines of the sync log, oldest first. */
  recentLog: string[]
}

export function getDaemonStatus({logLines = 15} = {}): DaemonStatus {
  const installed = isInstalled()
  const log = installed ? tailLog(logLines).trim() : ''
  return {
    installed,
    intervalSeconds: installed ? readInterval() : null,
    loaded: installed && isLoaded(),
    logPath: path.join(LOG_DIR, 'sync.log'),
    plistPath: PLIST_PATH,
    recentLog: log ? log.split('\n') : [],
  }
}

/** bin/run.js of this package. Two levels up from both src/core and dist/core. */
function resolveBin(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bin/run.js')
}

export interface InstallDaemonResult {
  intervalSeconds: number
  loaded: boolean
  nodePath: string
  plistPath: string
  /**
   * replaced: the running node is version-managed, so a stable one was used.
   * version-managed: no stable node exists; the agent breaks on the next upgrade.
   */
  nodeWarning?: {kind: 'replaced'; versionManaged: string} | {kind: 'version-managed'}
}

/** Install (or reinstall with new settings) the launchd agent that runs sync periodically. */
export function installDaemon({intervalSeconds = DEFAULT_INTERVAL_SECONDS} = {}): InstallDaemonResult {
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < MIN_INTERVAL_SECONDS) {
    throw new CoreError('INVALID_INPUT', `Interval must be at least ${MIN_INTERVAL_SECONDS} seconds`)
  }

  // Prefer a node that survives version upgrades. nvm/fnm/volta paths embed
  // the version number and disappear on the next upgrade, which would leave
  // the agent silently dead rather than visibly broken.
  let nodePath = process.execPath
  let nodeWarning: InstallDaemonResult['nodeWarning']
  if (isVersionedNodePath(nodePath)) {
    const stable = findStableNode()
    nodeWarning = stable ? {kind: 'replaced', versionManaged: nodePath} : {kind: 'version-managed'}
    nodePath = stable ?? nodePath
  }

  install({binPath: resolveBin(), intervalSeconds, nodePath})
  return {intervalSeconds, loaded: isLoaded(), nodePath, nodeWarning, plistPath: PLIST_PATH}
}

export function uninstallDaemon(): {removed: boolean} {
  if (!isInstalled()) return {removed: false}
  uninstall()
  return {removed: true}
}

export {DEFAULT_INTERVAL_SECONDS} from '../lib/daemon.js'
