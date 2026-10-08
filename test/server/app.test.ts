import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {expect} from 'chai'
import {Hono} from 'hono'

import {startServer} from '../../src/server/index.js'
import {JobRunner} from '../../src/server/jobs.js'
import {jobRoutes} from '../../src/server/routes/jobs.js'
import {cookieName} from '../../src/server/security.js'
import {EMPTY_SYSTEM, fakeBinaries, resetHome} from '../helpers.js'
import {COOKIE, HOST, ORIGIN, PORT, readSse, signedIn, TOKEN, testApp} from './client.js'

// One app per test: jobs live in its runner, so requests within a test must share it.
let app = testApp()
const request = (path: string, init: RequestInit & {headers?: Record<string, string>} = {}) => signedIn(app, path, init)

describe('web server', () => {
  let restorePath: () => void

  beforeEach(() => {
    resetHome()
    restorePath = fakeBinaries(EMPTY_SYSTEM)
    app = testApp()
  })

  afterEach(() => restorePath())

  describe('request checks', () => {
    it('rejects any Host but its own (DNS rebinding)', async () => {
      for (const host of ['evil.test', `evil.test:${PORT}`, `127.0.0.1:${PORT + 1}`, '']) {
        // biome-ignore lint/performance/noAwaitInLoops: each host on its own
        const response = await request('/api/status', {headers: {host}})
        expect(response.status, host).to.equal(403)
      }

      expect((await request('/api/status', {headers: {host: `localhost:${PORT}`}})).status).to.equal(200)
    })

    it('requires the session cookie everywhere', async () => {
      const api = await request('/api/status', {headers: {cookie: ''}})
      expect(api.status).to.equal(401)
      expect(await api.json()).to.include({code: 'UNAUTHORIZED'})

      expect((await request('/', {headers: {cookie: `${cookieName(PORT)}=wrong`}})).status).to.equal(401)
    })

    it('exchanges the URL token for an HttpOnly, SameSite=Strict cookie and cleans the URL', async () => {
      expect((await request('/?token=wrong', {headers: {cookie: ''}})).status).to.equal(401)

      const response = await request(`/?token=${TOKEN}`, {headers: {cookie: ''}})
      expect(response.status).to.equal(303)
      expect(response.headers.get('location')).to.equal('/')
      const cookie = response.headers.get('set-cookie') ?? ''
      expect(cookie).to.include(COOKIE).and.include('HttpOnly').and.include('SameSite=Strict')
    })

    it('refuses state-changing requests from another origin (CSRF)', async () => {
      const post = (headers: Record<string, string>) =>
        request('/api/jobs/sync', {
          body: '{}',
          headers: {'content-type': 'application/json', ...headers},
          method: 'POST',
        })

      expect((await post({})).status).to.equal(403)
      expect((await post({origin: 'https://evil.test'})).status).to.equal(403)
      expect((await post({origin: ORIGIN})).status).to.equal(202)
    })

    it('sends security headers', async () => {
      const response = await request('/api/status')
      expect(response.headers.get('x-frame-options')).to.equal('DENY')
      expect(response.headers.get('referrer-policy')).to.equal('no-referrer')
      expect(response.headers.get('content-security-policy')).to.include("default-src 'self'")
      expect(response.headers.get('cache-control')).to.equal('no-store')
    })
  })

  describe('web app', () => {
    it('serves the built app, and its index for every client route', async () => {
      const webRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-web-'))
      fs.mkdirSync(path.join(webRoot, 'assets'))
      fs.writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><div id="root"></div>')
      fs.writeFileSync(path.join(webRoot, 'assets', 'app.js'), 'console.log(1)')
      app = testApp(webRoot)

      const index = await request('/')
      expect(index.status).to.equal(200)
      expect(await index.text()).to.include('id="root"')

      const asset = await request('/assets/app.js')
      expect(asset.headers.get('content-type')).to.match(/javascript/)

      expect(await (await request('/some/client/route')).text()).to.include('id="root"')
      expect((await request('/assets/app.js', {headers: {cookie: ''}})).status).to.equal(401)
      fs.rmSync(webRoot, {force: true, recursive: true})
    })

    it('says so when the app has not been built', async () => {
      const response = await request('/')
      expect(response.status).to.equal(503)
      expect(await response.text()).to.include('npm run build')
    })
  })

  describe('jobs', () => {
    it('streams events live, resumes after Last-Event-ID, and allows one job at a time', async () => {
      const runner = new JobRunner()
      const routes = new Hono().route('/jobs', jobRoutes(runner))
      let release: () => void = () => undefined
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })

      const job = runner.start<number, string>('demo', async (emit) => {
        emit(1)
        await gate
        emit(2)
        emit(3)
        return 'done'
      })
      expect(() => runner.start('other', () => null)).to.throw(/still running/)

      const live = routes.request(`/jobs/${job.id}/events`)
      setTimeout(release, 20)
      const events = await readSse(await live)
      expect(events).to.deep.equal([
        ['event', 1],
        ['event', 2],
        ['event', 3],
        ['end', {...runner.get(job.id)}],
      ])

      const resumed = await readSse(await routes.request(`/jobs/${job.id}/events`, {headers: {'last-event-id': '1'}}))
      expect(resumed.map(([name, data]) => (name === 'event' ? data : name))).to.deep.equal([3, 'end'])
    })

    it('reports a failed job with its error', async () => {
      const runner = new JobRunner()
      const original = console.error
      console.error = () => undefined // the server logs unexpected errors to its terminal
      const job = runner.start('broken', () => {
        throw new Error('boom /secret/path')
      })
      await new Promise((resolve) => setTimeout(resolve, 10))
      console.error = original
      expect(runner.get(job.id)).to.deep.include({status: 'failed'})
      expect(runner.get(job.id)?.error?.message).to.not.include('/secret/path')
    })
  })

  describe('startServer', () => {
    it('listens on 127.0.0.1 and signs a browser in through the printed URL', async () => {
      const server = await startServer()
      try {
        expect(server.url).to.match(new RegExp(`^http://127\\.0\\.0\\.1:${server.port}/\\?token=[\\w-]{40,}$`))

        const signIn = await fetch(server.url, {redirect: 'manual'})
        expect(signIn.status).to.equal(303)
        const cookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0]

        const status = await fetch(`http://127.0.0.1:${server.port}/api/status`, {headers: {cookie}})
        expect(status.status).to.equal(200)
      } finally {
        await server.close()
      }
    })
  })
})
