/*
 * Purpose: Keep a registered runner running on this Mac as a launchd service,
 * and tell whether it is.
 * Intention: uses run and tryRun from exec to drive the runner's own `svc.sh`
 * (a LaunchAgent) and `launchctl`. The service name is read from the `svc.sh`
 * that `config.sh` generated, because the runner shortens long names itself.
 * Speaks to core/runners.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {run, tryRun} from '../exec.js'

/** The launchd label `config.sh` wrote into `svc.sh`, or null before registration. */
export function serviceName(dir: string): null | string {
  let script: string
  try {
    script = fs.readFileSync(path.join(dir, 'svc.sh'), 'utf8')
  } catch {
    return null
  }

  const match = /^SVC_NAME="([^"]+)"/m.exec(script)
  // svc.sh replaces spaces itself on its next line.
  return match ? match[1].replaceAll(' ', '_') : null
}

/** `svc.sh install` writes `.service` with the plist path. */
export function isInstalled(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.service'))
}

export function isLoaded(name: string): boolean {
  return tryRun('launchctl', ['list', name]) !== null
}

export function svc(dir: string, command: 'install' | 'start' | 'stop' | 'uninstall'): void {
  run('./svc.sh', [command], {cwd: dir})
}

/** Where the plist of svc.sh points the runner's output. */
export function logPath(name: string): string {
  return path.join(os.homedir(), 'Library/Logs', name, 'stdout.log')
}

/** The last `lines` lines of the service log, oldest first; empty when there is none yet. */
export function tailServiceLog(name: string, lines: number): string[] {
  let content: string
  try {
    content = fs.readFileSync(logPath(name), 'utf8')
  } catch {
    return []
  }

  return content.split('\n').filter(Boolean).slice(-lines)
}
