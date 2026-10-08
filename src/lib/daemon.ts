import {execFileSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export const DAEMON_LABEL = 'com.phibar.dotsloth.sync'

/** Once a day, per #7. */
export const DEFAULT_INTERVAL_SECONDS = 86_400

export const PLIST_PATH = path.join(os.homedir(), 'Library/LaunchAgents', `${DAEMON_LABEL}.plist`)
export const LOG_DIR = path.join(os.homedir(), 'Library/Logs/dotsloth')

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

export interface DaemonOptions {
  /** Absolute path to the dotsloth executable */
  binPath: string
  intervalSeconds?: number
  /** Absolute path to a node binary */
  nodePath?: string
}

/**
 * Build the LaunchAgent plist.
 *
 * RunAtLoad is deliberately true: a laptop that was asleep at the scheduled
 * time never fires a StartInterval job, so without it a machine that is only
 * awake during the day can go weeks without syncing.
 */
export function generatePlist(options: DaemonOptions): string {
  const {binPath, intervalSeconds = DEFAULT_INTERVAL_SECONDS, nodePath = process.execPath} = options

  const args = [nodePath, binPath, 'sync']
  const program = args.map((a) => `    <string>${escapeXml(a)}</string>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${DAEMON_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${program}
  </array>
  <key>StartInterval</key>
  <integer>${intervalSeconds}</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(path.join(LOG_DIR, 'sync.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(path.join(LOG_DIR, 'sync.error.log'))}</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
`
}

/**
 * True when a node path will not survive a version upgrade.
 *
 * launchd runs with a minimal environment and no shell profile, so nvm's shims
 * are absent and the plist must name an absolute node. But nvm's absolute paths
 * embed the version (.nvm/versions/node/v24.12.0/bin/node) and vanish the next
 * time node is upgraded, leaving the agent silently dead. Callers warn on this.
 */
export function isVersionedNodePath(nodePath: string): boolean {
  return nodePath.includes('/.nvm/versions/') || nodePath.includes('/.fnm/') || nodePath.includes('/.volta/')
}

/** A node that is stable across version upgrades, if one exists on this machine. */
export function findStableNode(): null | string {
  for (const candidate of ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node']) {
    if (fs.existsSync(candidate)) return candidate
  }

  return null
}

function domainTarget(): string {
  return `gui/${process.getuid?.() ?? ''}`
}

export function isInstalled(): boolean {
  return fs.existsSync(PLIST_PATH)
}

export function isLoaded(): boolean {
  try {
    execFileSync('launchctl', ['print', `${domainTarget()}/${DAEMON_LABEL}`], {stdio: 'pipe'})
    return true
  } catch {
    return false
  }
}

export function install(options: DaemonOptions): void {
  fs.mkdirSync(path.dirname(PLIST_PATH), {recursive: true})
  fs.mkdirSync(LOG_DIR, {recursive: true})
  fs.writeFileSync(PLIST_PATH, generatePlist(options), 'utf8')

  // bootout first so install doubles as "reinstall with new settings"
  try {
    execFileSync('launchctl', ['bootout', `${domainTarget()}/${DAEMON_LABEL}`], {stdio: 'pipe'})
  } catch {
    // not loaded — fine
  }

  execFileSync('launchctl', ['bootstrap', domainTarget(), PLIST_PATH], {stdio: 'pipe'})
}

export function uninstall(): boolean {
  try {
    execFileSync('launchctl', ['bootout', `${domainTarget()}/${DAEMON_LABEL}`], {stdio: 'pipe'})
  } catch {
    // not loaded — fine
  }

  if (fs.existsSync(PLIST_PATH)) {
    fs.unlinkSync(PLIST_PATH)
    return true
  }

  return false
}

export function runNow(): void {
  execFileSync('launchctl', ['kickstart', '-k', `${domainTarget()}/${DAEMON_LABEL}`], {stdio: 'pipe'})
}

export function readInterval(): null | number {
  if (!isInstalled()) return null
  const content = fs.readFileSync(PLIST_PATH, 'utf8')
  const match = content.match(/<key>StartInterval<\/key>\s*<integer>(\d+)<\/integer>/)
  return match ? Number(match[1]) : null
}

export function tailLog(lines = 20): string {
  const logPath = path.join(LOG_DIR, 'sync.log')
  if (!fs.existsSync(logPath)) return ''
  return fs.readFileSync(logPath, 'utf8').split('\n').slice(-lines).join('\n')
}
