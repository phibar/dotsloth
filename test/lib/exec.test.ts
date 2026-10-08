import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {expect} from 'chai'

import {ExecError, run, runAsync, runStreaming, tryRun} from '../../src/lib/exec.js'
import {parseGitUrl} from '../../src/lib/git.js'
import {addSecret, deleteSecret, getSecret, isValidSecretName} from '../../src/lib/keychain.js'

/** Input that would run a command if it ever reached a shell. */
const HOSTILE = ['"; touch PWNED; "', '$(touch PWNED)', '`touch PWNED`', "'; touch PWNED; '"]

describe('exec wrapper', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-exec-'))
  })

  afterEach(() => {
    fs.rmSync(dir, {force: true, recursive: true})
  })

  it('passes every argument literally, never through a shell', () => {
    const out = run('printf', ['%s\\n', ...HOSTILE], {cwd: dir})
    expect(out.split('\n').filter(Boolean)).to.deep.equal(HOSTILE)
    expect(fs.existsSync(path.join(dir, 'PWNED'))).to.equal(false)
  })

  it('throws ExecError with exit code and stderr', () => {
    try {
      run('sh', ['-c', 'echo broken >&2; exit 3'])
      expect.fail('should have thrown')
    } catch (error) {
      expect(error).to.be.instanceOf(ExecError)
      expect((error as ExecError).exitCode).to.equal(3)
      expect((error as ExecError).message).to.equal('broken')
    }
  })

  it('tryRun returns null instead of throwing', () => {
    expect(tryRun('sh', ['-c', 'exit 1'])).to.equal(null)
    expect(tryRun('dotsloth-no-such-binary', [])).to.equal(null)
  })

  it('writes input to stdin', () => {
    expect(run('cat', [], {input: 'from stdin'})).to.equal('from stdin')
  })

  it('runAsync resolves stdout and rejects with ExecError', async () => {
    expect(await runAsync('printf', ['%s', 'async'])).to.equal('async')
    expect(await runAsync('cat', [], {input: 'piped'})).to.equal('piped')

    let caught: unknown
    await runAsync('sh', ['-c', 'echo nope >&2; exit 2']).catch((error) => {
      caught = error
    })
    expect(caught).to.be.instanceOf(ExecError)
    expect((caught as ExecError).message).to.equal('nope')
  })

  it('runStreaming reports lines from both streams, splitting on \\r like git progress', async () => {
    const lines: string[] = []
    const code = await runStreaming('sh', ['-c', String.raw`printf 'a\nb'; printf '10%%\r50%%\r100%%\n' >&2; exit 4`], {
      onLine: (line, stream) => lines.push(`${stream}:${line}`),
    })
    expect(code).to.equal(4)
    expect(lines.filter((l) => l.startsWith('stdout:'))).to.deep.equal(['stdout:a', 'stdout:b'])
    expect(lines.filter((l) => l.startsWith('stderr:'))).to.deep.equal(['stderr:10%', 'stderr:50%', 'stderr:100%'])
  })
})

describe('keychain process calls', () => {
  let bin: string
  let argvFile: string
  let originalPath: string | undefined

  beforeEach(() => {
    // A fake `security` that records its argv, one argument per line.
    bin = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-bin-'))
    argvFile = path.join(bin, 'argv.txt')
    fs.writeFileSync(path.join(bin, 'security'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${argvFile}'\n`, {mode: 0o755})
    originalPath = process.env.PATH
    process.env.PATH = `${bin}${path.delimiter}${originalPath}`
  })

  afterEach(() => {
    process.env.PATH = originalPath
    fs.rmSync(bin, {force: true, recursive: true})
  })

  const recordedArgv = () => fs.readFileSync(argvFile, 'utf8').split('\n').slice(0, -1)

  it('passes a hostile secret value as one literal argument', () => {
    for (const value of HOSTILE) {
      addSecret('API_TOKEN', value)
      expect(recordedArgv()).to.deep.equal([
        'add-generic-password',
        '-a',
        'dotsloth',
        '-s',
        'API_TOKEN',
        '-w',
        value,
        '-U',
      ])
    }

    expect(fs.existsSync('PWNED')).to.equal(false)
  })

  it('rejects names that are not shell identifiers before calling security', () => {
    for (const name of [...HOSTILE, '-D', '1ABC', 'WITH SPACE', '']) {
      expect(isValidSecretName(name), name).to.equal(false)
      expect(() => addSecret(name, 'x'), name).to.throw(/Invalid secret name/)
      expect(getSecret(name), name).to.equal(null)
      expect(deleteSecret(name), name).to.equal(false)
    }

    expect(fs.existsSync(argvFile)).to.equal(false)
  })

  it('accepts ordinary environment variable names', () => {
    for (const name of ['AWS_ACCESS_KEY_ID', 'OPENAI_API_KEY', '_PRIVATE', 'lower_case']) {
      expect(isValidSecretName(name), name).to.equal(true)
    }
  })
})

describe('parseGitUrl', () => {
  it('parses SSH and HTTPS URLs', () => {
    expect(parseGitUrl('git@github.com:phibar/dotsloth.git')).to.deep.equal({
      host: 'github.com',
      org: 'phibar',
      repo: 'dotsloth',
    })
    expect(parseGitUrl('https://github.com/ipfs/kubo')).to.deep.equal({host: 'github.com', org: 'ipfs', repo: 'kubo'})
  })

  it('rejects anything before, after or inside the address', () => {
    for (const url of [
      '--upload-pack=touch /tmp/PWNED git@github.com:a/b',
      '-c core.sshCommand=x git@github.com:a/b',
      'git@github.com:a/b --upload-pack=x',
      'xhttps://github.com/a/b',
      'https://github.com/a/b c',
    ]) {
      expect(parseGitUrl(url), url).to.equal(null)
    }
  })
})
