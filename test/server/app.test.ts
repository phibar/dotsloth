import {expect} from 'chai'
import {Hono} from 'hono'

import {replaceConfig} from '../../src/core/config.js'
import {getDefaultConfig} from '../../src/lib/config.js'
import {createApp} from '../../src/server/app.js'
import {startServer} from '../../src/server/index.js'
import {JobRunner} from '../../src/server/jobs.js'
import {jobRoutes} from '../../src/server/routes/jobs.js'
import {cookieName} from '../../src/server/security.js'
import {EMPTY_SYSTEM, fakeBinaries, resetHome} from '../helpers.js'

const PORT = 4711
const TOKEN = 'test-token-0123456789'
const HOST = `127.0.0.1:${PORT}`
const ORIGIN = `http://${HOST}`
const COOKIE = `${cookieName(PORT)}=${TOKEN}`

// One app per test: jobs live in its runner, so requests within a test must share it.
let app = createApp({port: () => PORT, token: TOKEN})

function request(path: string, init: RequestInit & {headers?: Record<string, string>} = {}) {
  return app.request(path, {...init, headers: {cookie: COOKIE, host: HOST, ...init.headers}})
}

/** Read an SSE response to the end and return its events as [name, data]. */
async function readSse(response: Response): Promise<Array<[string, unknown]>> {
  const text = await response.text()
  return text
    .split('\n\n')
    .filter((block) => block.includes('data:'))
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message'
      const data = /^data: (.*)$/m.exec(block)?.[1] ?? 'null'
      return [event, JSON.parse(data)]
    })
}

describe('web server', () => {
  let restorePath: () => void

  beforeEach(() => {
    resetHome()
    restorePath = fakeBinaries(EMPTY_SYSTEM)
    app = createApp({port: () => PORT, token: TOKEN})
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
