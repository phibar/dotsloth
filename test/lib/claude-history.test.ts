import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {expect} from 'chai'
import {sessionFiles} from '../../src/lib/claude-history.js'
import type {ClaudeProject} from '../../src/lib/claude-projects.js'

const write = (dir: string, name: string, body = '{"type":"x"}\n') => {
  fs.mkdirSync(dir, {recursive: true})
  fs.writeFileSync(path.join(dir, name), body, 'utf8')
}

/**
 * The reinstall case: the store is full and the machine is empty. Listing only
 * the local directory meant pull iterated nothing and silently restored
 * nothing, which is the one scenario history sync exists for.
 */
describe('sessionFiles', () => {
  let home: string
  let projectDir: string
  let storeDir: string
  let project: ClaudeProject

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-hist-'))
    projectDir = path.join(home, 'projects', '-Users-x-github-org-repo')
    // Mirrors SESSIONS_STORE/<key>, which the module derives from the key.
    storeDir = path.join(
      os.homedir(),
      'Library/Mobile Documents/com~apple~CloudDocs/development/dotsloth/claude/history/sessions',
      'test-org/test-repo',
    )
    fs.mkdirSync(projectDir, {recursive: true})
    fs.rmSync(storeDir, {force: true, recursive: true})

    project = {
      key: 'test-org/test-repo',
      localPath: '/Users/x/github/org/repo',
      projectDir,
      slug: '-Users-x-github-org-repo',
    }
  })

  afterEach(() => {
    fs.rmSync(home, {force: true, recursive: true})
    fs.rmSync(storeDir, {force: true, recursive: true})
  })

  it('finds a session that exists only locally', () => {
    write(projectDir, 'a.jsonl')
    expect(sessionFiles(project).map((f) => f.name)).to.deep.equal(['a.jsonl'])
  })

  it('finds a session that exists only in the store', () => {
    // The fresh-machine case: nothing local, everything in the store.
    write(storeDir, 'b.jsonl')
    expect(sessionFiles(project).map((f) => f.name)).to.deep.equal(['b.jsonl'])
  })

  it('unions both sides without duplicating', () => {
    write(projectDir, 'a.jsonl')
    write(projectDir, 'shared.jsonl')
    write(storeDir, 'shared.jsonl')
    write(storeDir, 'b.jsonl')

    expect(sessionFiles(project).map((f) => f.name)).to.deep.equal(['a.jsonl', 'b.jsonl', 'shared.jsonl'])
  })

  it('never marks a store-only session active', () => {
    // It cannot be mid-write on this machine, so it must not be skipped as live.
    write(storeDir, 'b.jsonl')
    expect(sessionFiles(project)[0].active).to.equal(false)
  })

  it('marks a freshly written local session active', () => {
    write(projectDir, 'a.jsonl')
    expect(sessionFiles(project)[0].active).to.equal(true)
  })

  it('returns nothing when the project has no store key', () => {
    write(projectDir, 'a.jsonl')
    expect(sessionFiles({...project, key: null})).to.have.lengthOf(0)
  })

  it('survives both directories being absent', () => {
    fs.rmSync(projectDir, {force: true, recursive: true})
    expect(sessionFiles(project)).to.have.lengthOf(0)
  })
})
