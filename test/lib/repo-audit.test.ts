import {expect} from 'chai'
import {execFileSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {auditRepo, isAtRisk} from '../../src/lib/repo-audit.js'

/**
 * doctor is the wipe gate, so the property that matters is that it can
 * actually reach zero once everything is backed up.
 */
describe('auditRepo dirty counting', () => {
  let dir: string
  let remote: string

  const git = (...args: string[]) =>
    execFileSync('git', ['-C', dir, ...args], {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']})

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-audit-'))
    remote = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-remote-'))
    execFileSync('git', ['init', '-q', '--bare', remote], {stdio: 'pipe'})

    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'test')
    git('config', 'commit.gpgsign', 'false')
    fs.writeFileSync(path.join(dir, 'README.md'), '# test\n', 'utf8')
    git('add', '-A')
    git('commit', '-q', '-m', 'initial')

    // Push to a real remote: without one, every commit is legitimately
    // unpushed and the repo is correctly at risk, which would mask what
    // these tests are actually about.
    git('remote', 'add', 'origin', remote)
    git('push', '-q', '-u', 'origin', 'HEAD')
  })

  afterEach(() => {
    fs.rmSync(dir, {force: true, recursive: true})
    fs.rmSync(remote, {force: true, recursive: true})
  })

  it('reports a clean repo as not at risk', () => {
    const audit = auditRepo(dir, {offline: true})
    expect(audit.dirty).to.equal(0)
    expect(isAtRisk(audit)).to.equal(false)
  })

  it('counts a modified tracked file', () => {
    fs.writeFileSync(path.join(dir, 'README.md'), '# changed\n', 'utf8')
    expect(auditRepo(dir, {offline: true}).dirty).to.equal(1)
  })

  it('counts an ordinary untracked file', () => {
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'scratch\n', 'utf8')
    expect(auditRepo(dir, {offline: true}).dirty).to.equal(1)
  })

  it('does not count an untracked file the env store backs up', () => {
    // Both of these are reported separately under "env files"; counting them
    // here too meant doctor could never reach zero.
    fs.writeFileSync(path.join(dir, '.env'), 'K=V\n', 'utf8')
    fs.writeFileSync(path.join(dir, 'docker-compose.override.yml'), 'services: {}\n', 'utf8')

    const audit = auditRepo(dir, {offline: true})
    expect(audit.dirty).to.equal(0)
    expect(isAtRisk(audit)).to.equal(false)
  })

  it('still counts a .env that has been committed and then modified', () => {
    // Tracked means it is real repository content, not a machine-local file.
    fs.writeFileSync(path.join(dir, '.env'), 'K=V\n', 'utf8')
    git('add', '-f', '.env')
    git('commit', '-q', '-m', 'add env')
    fs.writeFileSync(path.join(dir, '.env'), 'K=CHANGED\n', 'utf8')

    expect(auditRepo(dir, {offline: true}).dirty).to.equal(1)
  })

  it('counts stashes, which git status never shows', () => {
    fs.writeFileSync(path.join(dir, 'README.md'), '# wip\n', 'utf8')
    git('stash', '-q')

    const audit = auditRepo(dir, {offline: true})
    expect(audit.stashes).to.equal(1)
    expect(isAtRisk(audit)).to.equal(true)
  })
})
