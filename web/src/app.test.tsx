import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {ApiError, api} from './api.js'
import {App} from './app.js'
import {mockApi} from './test-utils.js'
import {ToastProvider, useToast} from './toast.js'

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), {status}))
}

const STATUS = {
  config: {exists: true, path: '/icloud/config.json', value: null},
  icloud: {accessible: true, path: '/icloud'},
  secrets: {names: []},
  sshKeys: [],
  symlinks: [],
}

describe('app shell', () => {
  beforeEach(() => {
    globalThis.location.hash = ''
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('shows every section and follows the hash route', async () => {
    mockApi({
      'GET /api/daemon': [200, {installed: false, loaded: false, recentLog: []}],
      'GET /api/status': [200, STATUS],
    })
    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    )

    expect(await screen.findByText('Connected')).toBeTruthy()
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('Dashboard')
    const links = screen.getAllByRole('link').map((a) => a.textContent)
    expect(links).toEqual(expect.arrayContaining(['Organizations', 'Config', 'Secrets', 'Env files', 'Daemon']))

    act(() => {
      globalThis.location.hash = '#/orgs'
      globalThis.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('Organizations')
    expect(screen.getByRole('link', {name: 'Organizations'}).getAttribute('aria-current')).toBe('page')
  })

  it('tells a signed-out browser to open the printed link', async () => {
    vi.stubGlobal('fetch', respond(401, {code: 'UNAUTHORIZED', message: 'nope'}))
    render(<App />)

    expect(await screen.findByText('Signed out')).toBeTruthy()
    expect(screen.getByText(/not signed in/)).toBeTruthy()
  })
})

describe('api client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends JSON and turns error responses into ApiError with details', async () => {
    const fetch = respond(400, {code: 'INVALID_INPUT', details: ['version: Invalid input'], message: 'bad'})
    vi.stubGlobal('fetch', fetch)

    const error = await api.jobs.sync({dryRun: true}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({code: 'INVALID_INPUT', details: ['version: Invalid input'], status: 400})

    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/jobs/sync')
    expect(init).toMatchObject({body: '{"dryRun":true}', method: 'POST'})
  })
})

describe('toasts', () => {
  afterEach(() => cleanup())

  it('shows an API error with its details', () => {
    function Trigger() {
      const toast = useToast()
      return (
        <button
          onClick={() => toast.error(new ApiError(400, {details: ['name: required'], message: 'Invalid'}))}
          type="button"
        >
          fail
        </button>
      )
    }

    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('fail'))

    expect(screen.getByRole('alert').textContent).toContain('Invalid')
    expect(screen.getByRole('alert').textContent).toContain('name: required')
  })
})
