import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {expect} from 'chai'

import {ExecError, run, runAsync, runStreaming, tryRun} from '../../src/lib/exec.js'

/**
 * Purpose: every argument reaches the process literally, never through
 * a shell, and a failure carries its exit code and stderr; streamed
 * output arrives line by line, git's \r progress included.
 *
 * Intention: runs real processes in a temp folder, where a hostile
 * argument read by a shell would leave a file behind.
 */

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

  it('runStreaming marks a line ended by a bare \\r as progress the next line rewrites', async () => {
    const lines: Array<[string, boolean]> = []
    await runStreaming('sh', ['-c', String.raw`printf 'a\r\nb\n10%%\r100%%, done.\nend'`], {
      onLine: (line, _stream, progress) => lines.push([line, progress]),
    })
    expect(lines).to.deep.equal([
      ['a', false],
      ['b', false],
      ['10%', true],
      ['100%, done.', false],
      ['end', false],
    ])
  })
})
