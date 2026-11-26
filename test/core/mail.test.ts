import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {expect} from 'chai'
import {applyMailRestore, exportMail, getMailStatus, planMailRestore} from '../../src/core/mail.js'
import {mailInstalled, writeExport} from '../../src/lib/mail.js'
import {codeOfAwaitedCall as codeOf} from '../__testdata__/repos.js'
import {fakeBinaries, resetHome} from '../helpers.js'

/**
 * Purpose: Mail's rules and signatures are exported to the store and
 * recreated where missing, a plan leaving Mail unchanged; without Mail,
 * an export is refused and everything plans as missing.
 *
 * Intention: a shell stand-in for osascript answers as Mail would; each
 * inner suite runs only on the machine it describes, so one of them is
 * pending on every run.
 */

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
