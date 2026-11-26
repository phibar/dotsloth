import * as fs from 'node:fs'
import * as path from 'node:path'
import {expect} from 'chai'
import {pullEnv, pushEnv, scanEnv} from '../../src/core/env.js'
import {PATHS} from '../../src/lib/paths.js'
import {resetHome} from '../helpers.js'

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
