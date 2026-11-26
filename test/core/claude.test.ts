import {execFileSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {expect} from 'chai'
import {
  applyHistorySync,
  applyMemorySync,
  getClaudeStatus,
  linkClaude,
  planHistorySync,
  planMemorySync,
} from '../../src/core/claude.js'
import {replaceConfig} from '../../src/core/config.js'
import {CLAUDE_DIR, CLAUDE_STORE} from '../../src/lib/claude.js'
import {HISTORY_FILE, SESSIONS_STORE, SHARED_HISTORY} from '../../src/lib/claude-history.js'
import {MEMORY_STORE} from '../../src/lib/claude-memory.js'
import {PROJECTS_DIR, slugify} from '../../src/lib/claude-projects.js'
import {getDefaultConfig, readConfig} from '../../src/lib/config.js'
import {PATHS} from '../../src/lib/paths.js'
import {codeOfAwaitedCall as codeOf} from '../__testdata__/repos.js'
import {resetHome} from '../helpers.js'

/**
 * Purpose: Claude Code's settings, memory and history reach the store
 * and come back on another machine: settings linked and recorded in the
 * config, memory copied and its index merged, finished sessions copied
 * while a live one stays.
 *
 * Intention: runs core/claude against the throwaway HOME of
 * test/setup.ts, with a ~/.claude and the iCloud store written into it
 * before each test.
 */

const write = (file: string, content: string) => {
  fs.mkdirSync(path.dirname(file), {recursive: true})
  fs.writeFileSync(file, content, 'utf8')
}

describe('core/claude', () => {
  const repo = () => path.join(PATHS.githubRoot, 'acme', 'web')
  const projectDir = () => path.join(PROJECTS_DIR, slugify(repo()))
  const git = (...args: string[]) => execFileSync('git', ['-C', repo(), ...args], {stdio: 'pipe'})

  beforeEach(() => {
    resetHome()
    replaceConfig(getDefaultConfig())
    fs.mkdirSync(repo(), {recursive: true})
    git('init', '-q')
    git('remote', 'add', 'origin', 'git@github.com:acme/web.git')
    fs.mkdirSync(projectDir(), {recursive: true})
  })

  it('links the shared settings, seeding the store and recording the link in the config', async () => {
    write(path.join(CLAUDE_DIR, 'settings.json'), '{"theme":"dark"}')

    const dry = await linkClaude({dryRun: true})
    expect(dry.map((e) => e.type)).to.deep.equal(['would-link', 'skipped'])
    expect(getClaudeStatus().files.map((f) => [f.name, f.state])).to.deep.equal([
      ['settings.json', 'local-only'],
      ['CLAUDE.md', 'absent'],
    ])

    const events = await linkClaude()
    expect(events.map((e) => e.type)).to.deep.equal(['seeded', 'linked', 'skipped'])
    expect(getClaudeStatus().files[0].state).to.equal('shared')
    expect(fs.readFileSync(path.join(CLAUDE_STORE, 'settings.json'), 'utf8')).to.equal('{"theme":"dark"}')
    expect(readConfig()?.syncedFiles.some((f) => f.target === path.join(CLAUDE_DIR, 'settings.json'))).to.equal(true)
  })

  it('refuses to link without ~/.claude', async () => {
    fs.rmSync(CLAUDE_DIR, {force: true, recursive: true})
    expect(getClaudeStatus().installed).to.equal(false)
    expect(await codeOf(() => linkClaude())).to.equal('NOT_FOUND')
  })

  it('plans and applies memory: copies facts, merges the shared index', () => {
    write(path.join(projectDir(), 'memory', 'MEMORY.md'), '- local fact\n')
    write(path.join(projectDir(), 'memory', 'local.md'), 'only here')
    write(path.join(MEMORY_STORE, 'acme/web', 'MEMORY.md'), '- stored fact\n')

    const status = planMemorySync()
    expect(status.projects).to.deep.equal([
      {
        files: [
          {action: 'merge', name: 'MEMORY.md', state: 'differs'},
          {action: 'copy', name: 'local.md', state: 'local-only'},
        ],
        key: 'acme/web',
      },
    ])
    expect(planMemorySync('pull').projects[0].files[1].action).to.equal('nothing-to-copy')

    const applied = applyMemorySync('push')
    expect(applied.changes).to.equal(2)
    const index = fs.readFileSync(path.join(MEMORY_STORE, 'acme/web', 'MEMORY.md'), 'utf8')
    expect(index).to.include('local fact').and.to.include('stored fact')
    expect(fs.readFileSync(path.join(MEMORY_STORE, 'acme/web', 'local.md'), 'utf8')).to.equal('only here')
    expect(planMemorySync().changes).to.equal(0)
  })

  it('plans and applies history: copies finished sessions, skips live ones, merges the log', async () => {
    const finished = path.join(projectDir(), 'finished.jsonl')
    write(finished, '{"a":1}\n')
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    fs.utimesSync(finished, hourAgo, hourAgo)
    write(path.join(projectDir(), 'live.jsonl'), '{"b":2}\n')
    write(HISTORY_FILE, '{"display":"x","timestamp":1}\n')

    const plan = planHistorySync('push')
    expect(plan).to.deep.include({sessionCount: 1, skippedActive: 1, skippedOld: 0})
    expect(plan.projects).to.deep.equal([{files: ['finished.jsonl'], key: 'acme/web'}])
    expect(plan.log).to.deep.equal({localEntries: 1, mergedEntries: 1, storeEntries: 0})

    applyHistorySync('push')
    expect(fs.existsSync(path.join(SESSIONS_STORE, 'acme/web', 'finished.jsonl'))).to.equal(true)
    expect(fs.existsSync(path.join(SESSIONS_STORE, 'acme/web', 'live.jsonl'))).to.equal(false)
    expect(fs.readFileSync(SHARED_HISTORY, 'utf8')).to.include('"display":"x"')

    expect(await codeOf(() => planHistorySync('status', {retentionDays: 0}))).to.equal('INVALID_INPUT')
  })
})
