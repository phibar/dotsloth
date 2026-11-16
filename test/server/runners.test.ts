import * as fs from 'node:fs'
import * as path from 'node:path'
import {expect} from 'chai'

import {calls, installRunnerFakes, orgDir} from '../__testdata__/runner/fakes.js'
import {mutate, readSse, signedIn, testApp} from './client.js'

/**
 * Purpose: the web API steers this Mac's runners as the CLI does — lists
 * them, adds and removes them as jobs a browser follows, starts, stops and
 * reads them — and refuses a request body it does not know.
 * Intention: runs createApp in-process against the stand-ins of
 * __testdata__/runner/fakes; one app per test, since jobs live in its
 * JobRunner. A job is followed to its end over its SSE stream.
 */
describe('web API: runners', () => {
  let app = testApp()
  let restore: () => void

  const finish = async (started: Response) => {
    expect(started.status).to.equal(202)
    const {id} = (await started.json()) as {id: string}
    const events = await readSse(await signedIn(app, `/api/jobs/${id}/events`))
    return events.at(-1)?.[1] as {error?: {code: string}; result?: unknown; status: string}
  }

  const add = () =>
    mutate(app, {body: {labels: ['e2e'], name: 'box', org: 'acme'}, method: 'POST', path: '/api/runners'})

  beforeEach(() => {
    restore = installRunnerFakes()
    app = testApp()
  })

  afterEach(() => restore())

  it('adds a runner as a job, then lists it with GitHub state', async () => {
    const end = await finish(await add())
    expect(end.status).to.equal('succeeded')
    expect(end.result).to.include({name: 'box', running: true})

    const {runners} = (await (await signedIn(app, '/api/runners')).json()) as {runners: Array<Record<string, unknown>>}
    expect(runners).to.have.length(1)
    expect(runners[0]).to.nested.include({'github.busy': true, name: 'box', org: 'acme'})
  })

  it('stops, starts and reads the log of a runner', async () => {
    await finish(await add())

    const stopped = await mutate(app, {method: 'POST', path: '/api/runners/acme/box/stop'})
    expect(await stopped.json()).to.include({running: false})
    const started = await mutate(app, {method: 'POST', path: '/api/runners/acme/box/start'})
    expect(await started.json()).to.include({running: true})

    const logs = await signedIn(app, '/api/runners/acme/box/logs?lines=1')
    expect(await logs.json()).to.deep.include({lines: ['Job e2e completed']})
  })

  it('removes a runner as a job', async () => {
    await finish(await add())
    const end = await finish(await mutate(app, {body: {}, method: 'POST', path: '/api/runners/acme/box/remove'}))

    expect(end.status).to.equal('succeeded')
    expect(calls()).to.include('config.sh remove --token RM-TOKEN')
    expect(fs.existsSync(path.join(orgDir(), '.runners', 'box'))).to.equal(false)
  })

  it('maps core errors to HTTP and refuses unknown fields', async () => {
    expect((await mutate(app, {method: 'POST', path: '/api/runners/acme/nope/stop'})).status).to.equal(404)
    expect((await signedIn(app, '/api/runners/acme/box/logs?lines=x')).status).to.equal(400)

    const unknown = await mutate(app, {body: {org: 'acme', sudo: true}, method: 'POST', path: '/api/runners'})
    expect(unknown.status).to.equal(400)
  })

  it('refuses a change without this server as Origin', async () => {
    await finish(await add())
    const forged = await signedIn(app, '/api/runners/acme/box/stop', {
      headers: {origin: 'https://evil.test'},
      method: 'POST',
    })
    expect(forged.status).to.equal(403)
  })
})
