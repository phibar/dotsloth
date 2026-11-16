/*
 * Purpose: Stand-ins for everything a runner operation reaches outside the
 * process — `gh`, `tar`, `launchctl` and the runner's own scripts — so the
 * tests of core/runners and of the runner routes run against the same fakes.
 * Intention: uses fakeBinaries and resetHome from test/helpers and saveConfig
 * from lib/config; the scripts beside it are what the fake `tar` unpacks.
 * Every call lands in $FAKE_LOG, which `calls()` reads; the FAKE_* switches a
 * test sets select a failure.
 */

import {createHash} from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'

import {getDefaultConfig, saveConfig} from '../../../src/lib/config.js'
import {PATHS} from '../../../src/lib/paths.js'
import {EMPTY_SYSTEM, fakeBinaries, resetHome} from '../../helpers.js'

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), '.')
const PACKAGE = 'runner-package'
const sha = (content: string) => createHash('sha256').update(content).digest('hex')

const FAKE_GH = String.raw`
echo "gh $*" >> "$FAKE_LOG"
case "$*" in
  "api users/"*) if [ -n "$FAKE_GH_TYPE" ]; then echo "$FAKE_GH_TYPE"; else echo Organization; fi ;;
  "api repos/actions/runner/releases/latest"*)
    printf '{"tag_name":"v9.9.9","body":"<!-- BEGIN SHA osx-arm64 -->%s<!-- END SHA osx-arm64 -->\\n<!-- BEGIN SHA osx-x64 -->%s<!-- END SHA osx-x64 -->"}\n' "$FAKE_SHA" "$FAKE_SHA" ;;
  "release download"*)
    while [ $# -gt 0 ]; do
      case "$1" in --pattern) pattern=$2 ;; --dir) dir=$2 ;; esac
      shift
    done
    printf '%s' "$FAKE_PACKAGE" > "$dir/$pattern" ;;
  *registration-token*) echo REG-TOKEN ;;
  *remove-token*) if [ -n "$FAKE_GH_REFUSE" ]; then echo "HTTP 404: Not Found" >&2; exit 1; fi; echo RM-TOKEN ;;
  "api --paginate"*)
    if [ -n "$FAKE_GH_DOWN" ]; then echo "error connecting to api.github.com" >&2; exit 1; fi
    echo '{"name":"box","status":"online","busy":true,"labels":["self-hosted","e2e"]}' ;;
  *) echo "unexpected gh $*" >&2; exit 2 ;;
esac`
const FAKE_TAR = String.raw`
echo "tar $*" >> "$FAKE_LOG"
cp "$FAKE_RUNNER_FIXTURE/config.sh" "$4/config.sh"
chmod +x "$4/config.sh"`
const FAKE_LAUNCHCTL = String.raw`[ "$1" = list ] && [ -f "$FAKE_LAUNCHD/$2" ]`

const env = ['FAKE_CONFIG_FAIL', 'FAKE_GH_DOWN', 'FAKE_GH_REFUSE', 'FAKE_GH_TYPE'] as const

/** The org folder of the configured organization `acme`. */
export const orgDir = () => path.join(PATHS.githubRoot, 'acme')

/** What reached the fake tools, one line per call. */
export const calls = () =>
  fs
    .readFileSync(process.env.FAKE_LOG as string, 'utf8')
    .split('\n')
    .filter(Boolean)

/**
 * A fresh HOME with the organization `acme` and one repo folder, and the
 * fakes first on PATH. Returns what undoes it.
 */
export function installRunnerFakes(): () => void {
  resetHome()
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-runner-'))
  fs.mkdirSync(path.join(scratch, 'launchd'))
  Object.assign(process.env, {
    FAKE_LAUNCHD: path.join(scratch, 'launchd'),
    FAKE_LOG: path.join(scratch, 'calls.log'),
    FAKE_PACKAGE: PACKAGE,
    FAKE_RUNNER_FIXTURE: fixture,
    FAKE_SHA: sha(PACKAGE),
  })
  fs.writeFileSync(process.env.FAKE_LOG as string, '')
  for (const name of env) delete process.env[name]

  saveConfig({
    ...getDefaultConfig(),
    organizations: [{folderName: 'acme', gitEmail: 'dev@acme.test', gitUsername: 'dev', name: 'acme'}],
  })
  fs.mkdirSync(path.join(orgDir(), 'web'), {recursive: true})
  const restorePath = fakeBinaries({...EMPTY_SYSTEM, gh: FAKE_GH, launchctl: FAKE_LAUNCHCTL, tar: FAKE_TAR})

  return () => {
    restorePath()
    fs.rmSync(scratch, {force: true, recursive: true})
    for (const name of ['FAKE_LAUNCHD', 'FAKE_LOG', 'FAKE_PACKAGE', 'FAKE_RUNNER_FIXTURE', 'FAKE_SHA', ...env]) {
      delete process.env[name]
    }
  }
}
