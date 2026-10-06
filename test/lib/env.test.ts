import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {isEnvFile, isTemplate, scanRepo} from '../../src/lib/env.js'

describe('env matching', () => {
  it('matches plain and suffixed env files', () => {
    expect(isEnvFile('.env')).to.equal(true)
    expect(isEnvFile('.env.local')).to.equal(true)
    expect(isEnvFile('.env.production')).to.equal(true)
  })

  it('matches the non-.env local overrides that have the same lifecycle', () => {
    // process-sync keeps one of these, and its own header says "NOT for commit"
    expect(isEnvFile('docker-compose.override.yml')).to.equal(true)
  })

  it('excludes committed templates', () => {
    for (const name of ['.env.example', '.env.sample', '.env.template', '.env.dist']) {
      expect(isTemplate(name), name).to.equal(true)
      expect(isEnvFile(name), name).to.equal(false)
    }
  })

  it('ignores unrelated files', () => {
    expect(isEnvFile('package.json')).to.equal(false)
    expect(isEnvFile('environment.ts')).to.equal(false)
  })
})

describe('scanRepo', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-env-'))
  })

  afterEach(() => {
    fs.rmSync(dir, {force: true, recursive: true})
  })

  const write = (relative: string, content = 'K=V') => {
    const full = path.join(dir, relative)
    fs.mkdirSync(path.dirname(full), {recursive: true})
    fs.writeFileSync(full, content, 'utf8')
  }

  it('finds nested env files in a monorepo', () => {
    // coins has exactly this shape: one at the root and one under apps/web
    write('.env')
    write('apps/web/.env')

    const found = scanRepo(dir, 'org', 'repo').map((f) => f.relativePath)
    expect(found).to.have.members(['.env', path.join('apps', 'web', '.env')])
  })

  it('does not descend into build output or dependencies', () => {
    write('.env')
    write('node_modules/pkg/.env')
    write('.next/standalone/.env')
    write('dist/.env')

    const found = scanRepo(dir, 'org', 'repo').map((f) => f.relativePath)
    expect(found).to.deep.equal(['.env'])
  })

  it('skips templates', () => {
    write('.env.example')
    const found = scanRepo(dir, 'org', 'repo')
    expect(found).to.have.lengthOf(0)
  })
})
