import {act, cleanup, fireEvent, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {FakeEventSource, installFakeEventSource, mockApi, renderWithToasts} from '../test-utils.js'
import {RunnersPage} from './runners.js'

const RUNNER = {
  github: {busy: true, labels: ['self-hosted', 'e2e'], name: 'mini', status: 'online'},
  logPath: '/logs/stdout.log',
  name: 'mini',
  org: 'acme',
  path: '/gh/acme/.runners/mini',
  registered: true,
  running: true,
  serviceInstalled: true,
  serviceName: 'actions.runner.acme.mini',
}

const ORGS = [
  {
    exists: true,
    folderName: 'acme',
    gitEmail: 'dev@acme.test',
    gitUsername: 'dev',
    name: 'acme',
    path: '/gh/acme',
    repoCount: 3,
  },
]
const JOB = (id: string) => [202, {events: [], id, kind: 'runner', status: 'running'}] as [number, unknown]

/**
 * Purpose: the Runners page shows this Mac's runners with their launchd and
 * GitHub state, and adds, stops, reads and removes them through the runner
 * API, following add and remove as jobs.
 * Intention: renders the page against mockApi's answers by "METHOD /path"
 * and drives the jobs' SSE streams by hand with FakeEventSource.
 */
describe('runners page', () => {
  beforeEach(() => installFakeEventSource())
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const routes = (extra: Parameters<typeof mockApi>[0] = {}) =>
    mockApi({
      'GET /api/orgs': [200, ORGS],
      'GET /api/runners': [200, {runners: [RUNNER], warnings: ["Could not read the runners of 'other' from GitHub"]}],
      ...extra,
    })

  it("lists runners with launchd and GitHub state, and GitHub's warnings", async () => {
    routes()
    renderWithToasts(<RunnersPage />)

    expect(await screen.findByText('acme / mini')).toBeTruthy()
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByText(/GitHub: online, busy/)).toBeTruthy()
    expect(screen.getByText('Labels: self-hosted, e2e')).toBeTruthy()
    expect(screen.getByText(/Could not read the runners of 'other'/)).toBeTruthy()
  })

  it('adds a runner as a job with its labels, shows its steps and reloads the list', async () => {
    const calls = routes({'POST /api/runners': JOB('add-1')})
    renderWithToasts(<RunnersPage />)

    await screen.findByText('acme / mini')
    fireEvent.change(screen.getByPlaceholderText('e2e, macos-build'), {target: {value: 'e2e, macos-build ,'}})
    fireEvent.click(screen.getByText('Add runner'))
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))

    expect(calls.find((c) => c.route === 'POST /api/runners')?.body).toEqual({
      labels: ['e2e', 'macos-build'],
      org: 'acme',
    })
    act(() => FakeEventSource.instances[0].emit('event', {label: 'Latest runner: 9.9.9', status: 'ok', type: 'step'}))
    expect(await screen.findByText(/✓ Latest runner: 9.9.9/)).toBeTruthy()

    act(() => FakeEventSource.instances[0].emit('end', {status: 'succeeded'}))
    await waitFor(() => expect(calls.filter((c) => c.route === 'GET /api/runners')).toHaveLength(2))
  })

  it('stops a running runner and reads its log', async () => {
    const calls = routes({
      'GET /api/runners/acme/mini/logs': [200, {lines: ['Listening for Jobs'], logPath: '/logs/stdout.log'}],
      'POST /api/runners/acme/mini/stop': [200, {...RUNNER, running: false}],
    })
    renderWithToasts(<RunnersPage />)

    fireEvent.click(await screen.findByText('Stop'))
    await waitFor(() => expect(calls.some((c) => c.route === 'POST /api/runners/acme/mini/stop')).toBe(true))

    fireEvent.click(screen.getByText('Logs'))
    expect(await screen.findByText('Listening for Jobs')).toBeTruthy()
  })

  it('removes a runner only after confirmation, passing force', async () => {
    const calls = routes({'POST /api/runners/acme/mini/remove': JOB('rm-1')})
    renderWithToasts(<RunnersPage />)

    fireEvent.click(await screen.findByText('Remove'))
    expect(calls.some((c) => c.route.endsWith('/remove'))).toBe(false)

    fireEvent.click(screen.getByLabelText(/Remove locally even if GitHub refuses/))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog.querySelector('.button-danger') as HTMLElement)

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
    expect(calls.find((c) => c.route === 'POST /api/runners/acme/mini/remove')?.body).toEqual({force: true})
  })
})
