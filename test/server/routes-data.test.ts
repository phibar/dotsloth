import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {expect} from 'chai'

import {PATHS} from '../../src/lib/paths.js'
import {EMPTY_SYSTEM, FAKE_SECURITY, fakeBinaries, resetHome} from '../helpers.js'
import {mutate, readSse, signedIn, testApp} from './client.js'

// One app per test: jobs live in its runner, so requests within a test must share it.
let app = testApp()
const request = (path: string, init: RequestInit & {headers?: Record<string, string>} = {}) => signedIn(app, path, init)

describe('web API: secrets, env files, doctor, mail and Claude Code', () => {
  let restorePath: () => void

  beforeEach(() => {
    resetHome()
    restorePath = fakeBinaries(EMPTY_SYSTEM)
    app = testApp()
  })

  afterEach(() => restorePath())

  describe('secrets', () => {
    let restore: () => void

    beforeEach(() => {
      process.env.FAKE_KEYCHAIN = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-keychain-'))
      restore = fakeBinaries({security: FAKE_SECURITY})
    })

    afterEach(() => {
      restore()
      fs.rmSync(process.env.FAKE_KEYCHAIN as string, {force: true, recursive: true})
      delete process.env.FAKE_KEYCHAIN
    })

    it('stores, lists, reveals one value on POST only, and removes', async () => {
      const add = (body: unknown) => mutate(app, {body, method: 'POST', path: '/api/secrets'})
      expect((await add({name: 'api_token', value: 'sk-1'})).status).to.equal(201)
      expect((await add({name: 'API_TOKEN', value: 'sk-2'})).status).to.equal(409)
      expect((await add({name: 'API_TOKEN', overwrite: true, value: 'sk-2'})).status).to.equal(201)
      expect((await add({name: '9bad', value: 'x'})).status).to.equal(400)

      expect(await (await request('/api/secrets')).json()).to.deep.equal({names: ['API_TOKEN']})
      expect(JSON.stringify(await (await request('/api/secrets')).json())).to.not.include('sk-')

      // Reading a value is a POST behind the Origin check; GET does not exist.
      expect((await request('/api/secrets/API_TOKEN/reveal')).status).to.equal(404)
      expect((await request('/api/secrets/API_TOKEN/reveal', {method: 'POST'})).status).to.equal(403)
      const revealed = await mutate(app, {method: 'POST', path: '/api/secrets/API_TOKEN/reveal'})
      expect(await revealed.json()).to.deep.equal({value: 'sk-2'})

      expect((await mutate(app, {method: 'DELETE', path: '/api/secrets/API_TOKEN'})).status).to.equal(200)
      expect((await mutate(app, {method: 'DELETE', path: '/api/secrets/API_TOKEN'})).status).to.equal(404)
    })
  })

  describe('env files', () => {
    it('scans without contents and previews a push without writing', async () => {
      const repo = path.join(PATHS.githubRoot, 'acme', 'web')
      fs.mkdirSync(path.join(repo, '.git'), {recursive: true})
      fs.writeFileSync(path.join(repo, '.env'), 'SECRET=value\n')

      const scan = await (await request('/api/env')).json()
      expect(scan.entries.map((e: {key: string; state: string}) => [e.key, e.state])).to.deep.equal([
        ['acme/web/.env', 'local-only'],
      ])
      expect(JSON.stringify(scan)).to.not.include('SECRET=value')

      const job = await (await mutate(app, {body: {dryRun: true}, method: 'POST', path: '/api/jobs/env-push'})).json()
      const events = await readSse(await request(`/api/jobs/${job.id}/events`))
      const [, final] = events.at(-1) as [string, {result: {transfers: Array<{outcome: string}>}}]
      expect(final.result.transfers.map((t) => t.outcome)).to.deep.equal(['would-copy'])
      expect(fs.existsSync(PATHS.icloudEnvs)).to.equal(false)

      const invalid = await mutate(app, {body: {force: 'yes'}, method: 'POST', path: '/api/jobs/env-push'})
      expect(invalid.status).to.equal(400)
    })
  })

  describe('doctor, mail and Claude Code', () => {
    it('runs the doctor as a job', async () => {
      const job = await (await mutate(app, {body: {offline: true}, method: 'POST', path: '/api/jobs/doctor'})).json()
      const events = await readSse(await request(`/api/jobs/${job.id}/events`))
      expect(events[0]).to.deep.equal([
        'event',
        {githubRoot: PATHS.githubRoot, offline: true, repoCount: 0, type: 'start'},
      ])
      const [, final] = events.at(-1) as [string, {result: {safe: boolean}}]
      expect(final.result.safe).to.equal(true)
    })

    it('reports mail state and never accepts a restore plan from the client', async () => {
      expect(await (await request('/api/mail')).json()).to.include({exported: null})
      expect((await request('/api/mail/restore-plan')).status).to.equal(404)

      const injected = await mutate(app, {
        body: {plan: {rules: [{action: 'create', name: 'x'}]}},
        method: 'POST',
        path: '/api/jobs/mail-restore',
      })
      expect(injected.status).to.equal(400)
    })

    it('validates Claude Code sync requests', async () => {
      expect(await (await request('/api/claude')).json()).to.include({installed: false})
      expect((await request('/api/claude/memory/plan?direction=sideways')).status).to.equal(400)
      const badRetention = await mutate(app, {
        body: {direction: 'push', retentionDays: 0},
        method: 'POST',
        path: '/api/jobs/claude-history',
      })
      expect(badRetention.status).to.equal(400)
    })
  })
})
