import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {expect} from 'chai'

import {addSecret, deleteSecret, getSecret, isValidSecretName} from '../../src/lib/keychain.js'

/**
 * Purpose: a secret value reaches security as one literal argument, and
 * a name that is no shell identifier is refused before security runs.
 *
 * Intention: a stand-in for security in a temp folder records the
 * arguments it receives.
 */

/** Input that would run a command if it ever reached a shell. */
const HOSTILE = ['"; touch PWNED; "', '$(touch PWNED)', '`touch PWNED`', "'; touch PWNED; '"]

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
