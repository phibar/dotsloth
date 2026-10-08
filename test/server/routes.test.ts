import {execFileSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {expect} from 'chai'

import {replaceConfig} from '../../src/core/config.js'
import {getDefaultConfig} from '../../src/lib/config.js'
import {PATHS} from '../../src/lib/paths.js'
import {EMPTY_SYSTEM, fakeBinaries, resetHome} from '../helpers.js'
import {mutate, ORIGIN, readSse, signedIn, testApp} from './client.js'

// One app per test: jobs live in its runner, so requests within a test must share it.
let app = testApp()
const request = (path: string, init: RequestInit & {headers?: Record<string, string>} = {}) => signedIn(app, path, init)

describe('web API', () => {
  let restorePath: () => void

  beforeEach(() => {
    resetHome()
    restorePath = fakeBinaries(EMPTY_SYSTEM)
    app = testApp()
  })

  afterEach(() => restorePath())

  describe('API', () => {
    it('returns status and config, and maps core errors to HTTP', async () => {
      const status = await request('/api/status')
      expect(status.status).to.equal(200)
      expect(await status.json()).to.have.nested.property('icloud.accessible', true)

      const missing = await request('/api/config')
      expect(missing.status).to.equal(404)
      expect(await missing.json()).to.include({code: 'CONFIG_MISSING'})

      expect((await request('/api/nope')).status).to.equal(404)
    })

    it('validates a config before saving it', async () => {
      const put = (body: unknown) =>
        request('/api/config', {
          body: JSON.stringify(body),
          headers: {'content-type': 'application/json', origin: ORIGIN},
          method: 'PUT',
        })

      const invalid = await put({...getDefaultConfig(), version: 2})
      expect(invalid.status).to.equal(400)
      expect((await invalid.json()).details[0]).to.match(/^version:/)

      const saved = await put(getDefaultConfig())
      expect(saved.status).to.equal(200)
      expect((await request('/api/config')).status).to.equal(200)
    })

    it('runs sync as a job and streams its end', async () => {
      replaceConfig(getDefaultConfig())
      const started = await request('/api/jobs/sync', {
        body: JSON.stringify({dryRun: true}),
        headers: {'content-type': 'application/json', origin: ORIGIN},
        method: 'POST',
      })
      const job = await started.json()
      expect(job).to.include({kind: 'sync', status: 'running'})

      const events = await readSse(await request(`/api/jobs/${job.id}/events`))
      const [name, final] = events.at(-1) as [string, {result: {steps: unknown[]}; status: string}]
      expect(name).to.equal('end')
      expect(final.status).to.equal('succeeded')
      expect(final.result.steps.length).to.be.greaterThan(0)
    })

    it('rejects unknown fields in a job request', async () => {
      const response = await request('/api/jobs/sync', {
        body: JSON.stringify({rm: '-rf'}),
        headers: {'content-type': 'application/json', origin: ORIGIN},
        method: 'POST',
      })
      expect(response.status).to.equal(400)
    })
  })

  describe('daemon API', () => {
    it('reports, installs with a validated interval, and uninstalls', async () => {
      const restore = fakeBinaries({launchctl: 'exit 0'})
      const send = (method: string, body?: unknown) =>
        request('/api/daemon', {
          body: body === undefined ? undefined : JSON.stringify(body),
          headers: {'content-type': 'application/json', origin: ORIGIN},
          method,
        })
      try {
        expect(await (await request('/api/daemon')).json()).to.include({installed: false})
        expect((await send('PUT', {intervalSeconds: 30})).status).to.equal(400)
        expect((await send('PUT', {intervalSeconds: 3600})).status).to.equal(200)
        expect(await (await request('/api/daemon')).json()).to.include({installed: true, intervalSeconds: 3600})
        expect(await (await send('DELETE')).json()).to.deep.equal({removed: true})
      } finally {
        restore()
      }
    })
  })

  describe('organizations and clone API', () => {
    const send = (method: string, url: string, body?: unknown) =>
      request(url, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {'content-type': 'application/json', origin: ORIGIN},
        method,
      })
    const acme = {gitEmail: 'dev@acme.test', gitUsername: 'dev', name: 'acme'}

    it('adds, lists, updates and removes organizations', async () => {
      expect((await send('POST', '/api/orgs', {...acme, gitEmail: 'broken'})).status).to.equal(400)
      expect((await send('POST', '/api/orgs', acme)).status).to.equal(201)
      expect((await send('POST', '/api/orgs', acme)).status).to.equal(409)

      const orgs = await (await request('/api/orgs')).json()
      expect(orgs.map((o: {name: string}) => o.name)).to.deep.equal(['acme'])

      const updated = await (await send('PUT', '/api/orgs/acme', {gitUsername: 'renamed'})).json()
      expect(updated).to.include({changed: true})

      expect((await send('DELETE', '/api/orgs/acme', {})).status).to.equal(200)
      expect((await send('DELETE', '/api/orgs/acme', {})).status).to.equal(404)
    })

    it('deletes repositories only when the request echoes the org name', async () => {
      await send('POST', '/api/orgs', acme)
      const repo = path.join(PATHS.githubRoot, 'acme', 'repo')
      fs.mkdirSync(repo, {recursive: true})

      expect((await send('DELETE', '/api/orgs/acme', {deleteRepos: true})).status).to.equal(400)
      expect((await send('DELETE', '/api/orgs/acme', {confirm: 'other', deleteRepos: true})).status).to.equal(400)
      expect(fs.existsSync(repo)).to.equal(true)

      const removed = await (await send('DELETE', '/api/orgs/acme', {confirm: 'acme', deleteRepos: true})).json()
      expect(removed).to.include({deletedFolder: true})
      expect(fs.existsSync(repo)).to.equal(false)
    })

    it('plans a clone and runs it as a job with streamed output', async () => {
      replaceConfig(getDefaultConfig())
      const sources = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-sources-'))
      const work = path.join(sources, 'work')
      fs.mkdirSync(work)
      const git = (...args: string[]) =>
        execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {stdio: 'pipe'})
      git('-C', work, 'init', '-q')
      git('-C', work, 'commit', '-q', '--allow-empty', '-m', 'initial')
      git('clone', '-q', '--bare', work, path.join(sources, 'stranger', 'web.git'))
      Object.assign(process.env, {
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: `url.file://${sources}/.insteadOf`,
        GIT_CONFIG_VALUE_0: 'https://example.test/',
      })

      try {
        const url = 'https://example.test/stranger/web.git'
        const plan = await (await send('POST', '/api/clone/plan', {url})).json()
        expect(plan).to.include({org: null, orgName: 'stranger', repo: 'web'})

        const job = await (await send('POST', '/api/jobs/clone', {target: {kind: 'none'}, url})).json()
        const events = await readSse(await request(`/api/jobs/${job.id}/events`))
        const [, final] = events.at(-1) as [string, {result: {repoPath: string}; status: string}]
        expect(final.status).to.equal('succeeded')
        expect(final.result.repoPath).to.equal(path.join(PATHS.githubRoot, 'stranger', 'web'))
        expect(events.some(([name, data]) => name === 'event' && (data as {type: string}).type === 'output')).to.equal(
          true,
        )
      } finally {
        for (const key of ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0']) delete process.env[key]
        fs.rmSync(sources, {force: true, recursive: true})
      }
    })
  })

  describe('config editing', () => {
    const put = (body: unknown, version?: string) =>
      mutate(app, {
        body,
        headers: version ? {'if-match': `"${version}"`} : {},
        method: 'PUT',
        path: '/api/config',
      })
    const etagOf = (response: Response) => (response.headers.get('etag') ?? '').replaceAll('"', '')

    it('versions the config and refuses to overwrite a newer file', async () => {
      replaceConfig(getDefaultConfig())
      const loaded = await request('/api/config')
      const version = etagOf(loaded)
      expect(version).to.match(/^[0-9a-f]{16}$/)

      // Someone else saves first (another Mac via iCloud, or the CLI).
      replaceConfig({...getDefaultConfig(), sshSigning: {defaultKeyPath: '/k', enabled: false}})

      const stale = await put(getDefaultConfig(), version)
      expect(stale.status).to.equal(409)
      expect(await stale.json()).to.include({code: 'CONFLICT'})
      expect(fs.readFileSync(PATHS.icloudConfig, 'utf8')).to.include('"enabled": false')

      const fresh = etagOf(await request('/api/config'))
      const saved = await put(getDefaultConfig(), fresh)
      expect(saved.status).to.equal(200)
      expect(etagOf(saved)).to.not.equal(fresh)
      expect(etagOf(saved)).to.equal(etagOf(await request('/api/config')))
    })
  })
})
