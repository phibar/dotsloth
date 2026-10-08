import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {expect} from 'chai'
import {getDaemonStatus, installDaemon, uninstallDaemon} from '../../src/core/daemon.js'
import {pullEnv, pushEnv, scanEnv} from '../../src/core/env.js'
import type {CoreError} from '../../src/core/errors.js'
import {listSecretNames, removeSecret, revealSecret, secretExists, setSecret} from '../../src/core/secrets.js'
import {PLIST_PATH} from '../../src/lib/daemon.js'
import {PATHS} from '../../src/lib/paths.js'
import {fakeBinaries, resetHome} from '../helpers.js'

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    return (error as CoreError).code
  }

  return undefined
}

/**
 * A stand-in for macOS `security` that keeps one file per secret in
 * $FAKE_KEYCHAIN and prints dump-keychain in the real format.
 */
const FAKE_SECURITY = String.raw`
cmd=$1; shift; name=""; value=""
while [ $# -gt 0 ]; do
  case "$1" in
    -s) name=$2; shift ;;
    -w) if [ $# -gt 1 ]; then value=$2; shift; fi ;;
  esac
  shift
done
file="$FAKE_KEYCHAIN/$name"
case "$cmd" in
  add-generic-password) printf '%s' "$value" > "$file" ;;
  find-generic-password) [ -f "$file" ] || exit 44; cat "$file"; echo ;;
  delete-generic-password) [ -f "$file" ] || exit 44; rm "$file" ;;
  dump-keychain) for f in "$FAKE_KEYCHAIN"/*; do [ -f "$f" ] || continue
    echo '    "acct"<blob>="dotsloth"'; echo "    \"svce\"<blob>=\"$(basename "$f")\""; done ;;
esac
`

describe('core/secrets', () => {
  let restorePath: () => void

  beforeEach(() => {
    resetHome()
    process.env.FAKE_KEYCHAIN = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-keychain-'))
    restorePath = fakeBinaries({security: FAKE_SECURITY})
  })

  afterEach(() => {
    restorePath()
    fs.rmSync(process.env.FAKE_KEYCHAIN as string, {force: true, recursive: true})
    delete process.env.FAKE_KEYCHAIN
  })

  it('stores, lists, reveals and removes a secret under its upper-case name', () => {
    expect(setSecret('openai_api_key', 'sk-123')).to.deep.equal({created: true, name: 'OPENAI_API_KEY'})
    expect(listSecretNames()).to.deep.equal(['OPENAI_API_KEY'])
    expect(secretExists('OPENAI_API_KEY')).to.equal(true)
    expect(revealSecret('openai_api_key')).to.equal('sk-123')

    expect(removeSecret('OPENAI_API_KEY')).to.deep.equal({name: 'OPENAI_API_KEY'})
    expect(listSecretNames()).to.deep.equal([])
  })

  it('refuses to replace a secret unless asked', () => {
    setSecret('TOKEN', 'old')
    expect(codeOf(() => setSecret('TOKEN', 'new'))).to.equal('CONFLICT')
    expect(revealSecret('TOKEN')).to.equal('old')

    expect(setSecret('TOKEN', 'new', {overwrite: true}).created).to.equal(false)
    expect(revealSecret('TOKEN')).to.equal('new')
  })

  it('keeps hostile values intact', () => {
    const value = '"; touch PWNED; $(whoami) `id`'
    setSecret('HOSTILE', value)
    expect(revealSecret('HOSTILE')).to.equal(value)
  })

  it('rejects bad names and empty values, and reports unknown secrets', () => {
    expect(codeOf(() => setSecret('1BAD', 'x'))).to.equal('INVALID_INPUT')
    expect(codeOf(() => setSecret('WITH SPACE', 'x'))).to.equal('INVALID_INPUT')
    expect(codeOf(() => setSecret('EMPTY', ''))).to.equal('INVALID_INPUT')
    expect(codeOf(() => revealSecret('MISSING'))).to.equal('NOT_FOUND')
    expect(codeOf(() => removeSecret('MISSING'))).to.equal('NOT_FOUND')
  })
})

describe('core/env', () => {
  const repo = () => path.join(PATHS.githubRoot, 'acme', 'web')
  const local = (name = '.env') => path.join(repo(), name)
  const stored = (name = '.env') => path.join(PATHS.icloudEnvs, 'acme', 'web', name)
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(file), {recursive: true})
    fs.writeFileSync(file, content, 'utf8')
  }

  beforeEach(() => {
    resetHome()
    // scanAll only looks inside real repositories.
    fs.mkdirSync(path.join(repo(), '.git'), {recursive: true})
    write(local(), 'SECRET=local-value\n')
  })

  it('scans states without ever returning file contents', () => {
    write(local('.env.local'), 'SAME=1\n')
    write(stored('.env.local'), 'SAME=1\n')

    const result = scanEnv()
    expect(result.entries.map((e) => [e.key, e.state])).to.deep.equal([
      ['acme/web/.env', 'local-only'],
      ['acme/web/.env.local', 'identical'],
    ])
    expect(scanEnv({unsavedOnly: true}).entries.map((e) => e.key)).to.deep.equal(['acme/web/.env'])
    expect(JSON.stringify(result)).to.not.include('local-value')
  })

  it('push: dry run writes nothing, a real push copies local-only files', () => {
    const dry = pushEnv({dryRun: true})
    expect(dry.transfers.map((t) => t.outcome)).to.deep.equal(['would-copy'])
    expect(fs.existsSync(stored())).to.equal(false)

    const real = pushEnv()
    expect(real).to.include({copied: 1, skipped: 0})
    expect(fs.readFileSync(stored(), 'utf8')).to.equal('SECRET=local-value\n')
    expect(JSON.stringify(real)).to.not.include('local-value')
  })

  it('push: a differing store copy is a conflict unless forced, globally or per file', () => {
    write(stored(), 'SECRET=other-machine\n')

    expect(pushEnv().transfers.map((t) => t.outcome)).to.deep.equal(['conflict'])
    expect(fs.readFileSync(stored(), 'utf8')).to.equal('SECRET=other-machine\n')

    expect(pushEnv({force: ['acme/web/.env.other']}).transfers[0].outcome).to.equal('conflict')
    expect(pushEnv({force: ['acme/web/.env']}).transfers[0].outcome).to.equal('copied')
    expect(fs.readFileSync(stored(), 'utf8')).to.equal('SECRET=local-value\n')
  })

  it('pull: restores into cloned repos only and respects local changes', () => {
    write(stored('.env'), 'SECRET=from-store\n')
    write(path.join(PATHS.icloudEnvs, 'acme', 'not-cloned', '.env'), 'X=1\n')

    const result = pullEnv()
    expect(result.transfers.map((t) => [t.key, t.outcome])).to.deep.equal([
      ['acme/not-cloned/.env', 'not-cloned'],
      ['acme/web/.env', 'conflict'],
    ])
    expect(fs.existsSync(path.join(PATHS.githubRoot, 'acme', 'not-cloned'))).to.equal(false)

    pullEnv({force: true})
    expect(fs.readFileSync(local(), 'utf8')).to.equal('SECRET=from-store\n')
  })
})

describe('core/daemon', () => {
  let restorePath: () => void
  let launchctlLog: string

  beforeEach(() => {
    resetHome()
    launchctlLog = path.join(os.homedir(), 'launchctl.log')
    restorePath = fakeBinaries({launchctl: `echo "$@" >> '${launchctlLog}'`})
  })

  afterEach(() => restorePath())

  it('is not installed in a fresh HOME', () => {
    expect(getDaemonStatus()).to.include({installed: false, intervalSeconds: null, loaded: false})
    expect(uninstallDaemon()).to.deep.equal({removed: false})
  })

  it('rejects intervals below a minute before touching launchd', () => {
    expect(codeOf(() => installDaemon({intervalSeconds: 59}))).to.equal('INVALID_INPUT')
    expect(codeOf(() => installDaemon({intervalSeconds: 90.5}))).to.equal('INVALID_INPUT')
    expect(fs.existsSync(PLIST_PATH)).to.equal(false)
    expect(fs.existsSync(launchctlLog)).to.equal(false)
  })

  it('installs, reports and uninstalls the agent', () => {
    const result = installDaemon({intervalSeconds: 3600})
    expect(result.plistPath).to.equal(PLIST_PATH)
    expect(fs.readFileSync(PLIST_PATH, 'utf8')).to.include('bin/run.js')

    const status = getDaemonStatus()
    expect(status).to.include({installed: true, intervalSeconds: 3600, loaded: true})
    expect(fs.readFileSync(launchctlLog, 'utf8')).to.include('bootstrap')

    expect(uninstallDaemon()).to.deep.equal({removed: true})
    expect(fs.existsSync(PLIST_PATH)).to.equal(false)
  })
})
