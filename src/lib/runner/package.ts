/*
 * Purpose: Put a verified copy of GitHub's runner application into a folder.
 * Intention: uses runAsync from exec to ask `gh` for the latest release of
 * actions/runner and download its macOS package, checks the package against
 * the SHA-256 the release notes publish, and unpacks it with `tar`. Speaks to
 * core/runners.
 */

import {createHash} from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {runAsync} from '../exec.js'

export const RUNNER_REPO = 'actions/runner'

export interface RunnerRelease {
  asset: string
  sha256: string
  version: string
}

/** The package name GitHub publishes for this Mac's architecture. */
export function platformKey(arch: string = process.arch): string {
  return arch === 'arm64' ? 'osx-arm64' : 'osx-x64'
}

/**
 * The hash the release notes publish between
 * `<!-- BEGIN SHA osx-arm64 -->` and `<!-- END SHA osx-arm64 -->`, or null.
 */
export function shaFromReleaseNotes(body: string, key: string): null | string {
  const match = new RegExp(`<!-- BEGIN SHA ${key} -->([\\da-f]{64})<!-- END SHA ${key} -->`).exec(body)
  return match ? match[1] : null
}

/** The latest release's package for this Mac, with its published hash. */
export async function latestRelease(arch: string = process.arch): Promise<RunnerRelease> {
  const raw = await runAsync('gh', ['api', `repos/${RUNNER_REPO}/releases/latest`, '--jq', '{tag_name, body}'])
  const {body, tag_name: tag} = JSON.parse(raw) as {body: string; tag_name: string}
  const version = tag.replace(/^v/, '')
  const key = platformKey(arch)
  const sha256 = shaFromReleaseNotes(body ?? '', key)
  if (!sha256) throw new Error(`Release ${tag} of ${RUNNER_REPO} publishes no SHA-256 for ${key}`)
  return {asset: `actions-runner-${key}-${version}.tar.gz`, sha256, version}
}

export function sha256OfFile(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

/**
 * Download the release package into `dir`, check its hash and unpack it
 * there. The package is deleted afterwards; a mismatching hash throws before
 * anything is unpacked.
 */
export async function installPackage(release: RunnerRelease, dir: string): Promise<void> {
  await runAsync('gh', [
    'release',
    'download',
    `v${release.version}`,
    '--repo',
    RUNNER_REPO,
    '--pattern',
    release.asset,
    '--dir',
    dir,
  ])
  const archive = path.join(dir, release.asset)
  const actual = sha256OfFile(archive)
  if (actual !== release.sha256) {
    throw new Error(`Checksum mismatch for ${release.asset}: expected ${release.sha256}, got ${actual}`)
  }

  await runAsync('tar', ['xzf', archive, '-C', dir])
  fs.rmSync(archive)
}
