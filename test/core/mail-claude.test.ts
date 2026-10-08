import {execFileSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
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
import type {CoreError} from '../../src/core/errors.js'
import {applyMailRestore, exportMail, getMailStatus, planMailRestore} from '../../src/core/mail.js'
import {CLAUDE_DIR, CLAUDE_STORE} from '../../src/lib/claude.js'
import {HISTORY_FILE, SESSIONS_STORE, SHARED_HISTORY} from '../../src/lib/claude-history.js'
import {MEMORY_STORE} from '../../src/lib/claude-memory.js'
import {PROJECTS_DIR, slugify} from '../../src/lib/claude-projects.js'
import {getDefaultConfig, readConfig} from '../../src/lib/config.js'
import {mailInstalled, writeExport} from '../../src/lib/mail.js'
import {PATHS} from '../../src/lib/paths.js'
import {fakeBinaries, resetHome} from '../helpers.js'

async function codeOf(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn()
  } catch (error) {
    return (error as CoreError).code
  }

  return undefined
}

const write = (file: string, content: string) => {
  fs.mkdirSync(path.dirname(file), {recursive: true})
  fs.writeFileSync(file, content, 'utf8')
}

const STORED = {
  accounts: [
    {emails: ['me@work.test'], name: 'Work', port: null, server: null, type: 'imap', user: 'me'},
    {emails: ['me@home.test', 'alias@home.test'], name: 'Home', port: null, server: null, type: 'iCloud', user: 'me'},
  ],
  exportedAt: '2026-01-01T00:00:00.000Z',
  rules: [
    {allConditions: true, conditions: [], enabled: true, moveTo: null, name: 'Present rule'},
    {
      allConditions: true,
      conditions: [{expression: 'x', qualifier: 'does contain value', ruleType: 'from header'}],
      enabled: true,
      moveTo: null,
      name: 'New rule',
    },
    {allConditions: true, conditions: [], enabled: true, moveTo: 'Archive/2026', name: 'Moving rule'},
  ],
  signatures: [
    {content: 'Regards', name: 'Present sig'},
    {content: 'Cheers', name: 'New sig'},
  ],
}

/**
 * Stand-in for osascript, so no test ever drives the real Mail. Answers the
 * read scripts with one account, signature and rule (in the lib's separator
 * format) and logs every script that creates something.
 */
const FAKE_OSASCRIPT = String.raw`
script=$(cat)
case "$script" in
  *"make new"*) echo "$script" >> "$OSASCRIPT_LOG" ;;
  *"every account"*) printf 'Work\037imap\037me\037me@work.test\037\0370\036' ;;
  *"every signature"*) printf 'Present sig\036' ;;
  *"content of signature"*) printf 'Regards' ;;
  *"every rule"*) printf 'Present rule\037true\037true\037\036' ;;
esac
`

describe('core/mail', () => {
  let restorePath: () => void
  let log: string

  beforeEach(() => {
    resetHome()
    log = path.join(os.homedir(), 'osascript.log')
    process.env.OSASCRIPT_LOG = log
    restorePath = fakeBinaries({osascript: FAKE_OSASCRIPT})
  })

  afterEach(() => {
    restorePath()
    delete process.env.OSASCRIPT_LOG
  })

  it('reports nothing exported, and refuses to plan a restore from nothing', async () => {
    expect(getMailStatus()).to.include({exported: null, local: null})
    expect(await codeOf(() => planMailRestore())).to.equal('NOT_FOUND')
  })

  describe('with Mail installed', () => {
    before(function () {
      if (!mailInstalled()) this.skip()
    })

    it('compares local Mail with the store', () => {
      writeExport(STORED)
      const status = getMailStatus()
      expect(status.local).to.deep.equal({accounts: 1, rules: 1, signatures: 1})
      expect(status.exported?.counts).to.deep.equal({accounts: 2, rules: 3, signatures: 2})
      expect(status.missingAccounts.map((a) => a.name)).to.deep.equal(['Home'])
    })

    it('exports what Mail has, or only reports it in a dry run', () => {
      const dry = exportMail({dryRun: true})
      expect(dry).to.include({ruleCount: 1, signatureCount: 1, written: false})
      expect(getMailStatus().exported).to.equal(null)

      expect(exportMail().written).to.equal(true)
      expect(getMailStatus().exported?.counts).to.deep.equal({accounts: 1, rules: 1, signatures: 1})
    })

    it('plans a restore without changing Mail, then creates only what is missing', () => {
      writeExport(STORED)
      const plan = planMailRestore()
      expect(plan.accounts.map((a) => [a.account.name, a.present])).to.deep.equal([
        ['Work', true],
        ['Home', false],
      ])
      // Signatures are stored one file each, so they come back sorted by name.
      expect(plan.signatures.map((s) => [s.name, s.action])).to.deep.equal([
        ['New sig', 'create'],
        ['Present sig', 'present'],
      ])
      expect(plan.rules.map((r) => [r.name, r.action])).to.deep.equal([
        ['Present rule', 'present'],
        ['New rule', 'create'],
        ['Moving rule', 'blocked'],
      ])
      expect(fs.existsSync(log)).to.equal(false)

      const created: string[] = []
      applyMailRestore((event) => created.push(`${event.kind}:${event.name}`))
      expect(created).to.deep.equal(['signature:New sig', 'rule:New rule'])
      const scripts = fs.readFileSync(log, 'utf8')
      expect(scripts).to.include('"New sig"').and.to.include('"New rule"')
      expect(scripts).to.not.include('Moving rule').and.to.not.include('Present')
    })
  })

  describe('without Mail', () => {
    before(function () {
      if (mailInstalled()) this.skip()
    })

    it('refuses to export and plans everything as missing', async () => {
      expect(await codeOf(() => exportMail())).to.equal('NOT_FOUND')
      writeExport(STORED)
      expect(planMailRestore().signatures.every((s) => s.action === 'create')).to.equal(true)
    })
  })
})

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
