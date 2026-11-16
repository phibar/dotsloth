/*
 * Purpose: Register an unpacked runner with an organization, and take that
 * registration back.
 * Intention: uses runStreaming from exec to run the runner's own `config.sh`
 * in its folder, unattended, so its output reaches the caller line by line.
 * The token comes from lib/runner/github. Speaks to core/runners.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import {ExecError, runStreaming} from '../exec.js'

export interface RegisterOptions {
  dir: string
  /** Added to the defaults `self-hosted`, the OS and the architecture. */
  labels: string[]
  name: string
  onLine: (line: string) => void
  org: string
  token: string
}

/** `config.sh` writes `.runner` once a registration succeeds. */
export function isRegistered(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.runner'))
}

async function configSh(dir: string, args: string[], onLine: (line: string) => void): Promise<void> {
  const code = await runStreaming('./config.sh', args, {cwd: dir, onLine: (line) => onLine(line)})
  if (code !== 0) throw new ExecError('config.sh', code, `config.sh failed with exit code ${code}`)
}

export async function register(options: RegisterOptions): Promise<void> {
  const {dir, labels, name, onLine, org, token} = options
  const args = ['--unattended', '--url', `https://github.com/${org}`, '--token', token, '--name', name]
  args.push('--work', '_work')
  if (labels.length > 0) args.push('--labels', labels.join(','))
  await configSh(dir, args, onLine)
}

export async function unregister(dir: string, token: string, onLine: (line: string) => void): Promise<void> {
  await configSh(dir, ['remove', '--token', token], onLine)
}
