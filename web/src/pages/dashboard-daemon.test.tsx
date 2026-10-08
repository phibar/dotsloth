import {act, cleanup, fireEvent, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {FakeEventSource, installFakeEventSource, mockApi, renderWithToasts} from '../test-utils.js'
import {DaemonPage} from './daemon.js'
import {Dashboard, formatInterval} from './dashboard.js'

const config = {
  organizations: [{folderName: 'acme', gitEmail: 'dev@acme.test', gitUsername: 'dev', name: 'acme'}],
  paths: {githubRoot: '/gh'},
  sshSigning: {defaultKeyPath: '/k', enabled: true},
  syncedFiles: [],
  version: 1,
}

const STATUS = {
  config: {exists: true, path: '/icloud/config.json', value: config},
  icloud: {accessible: true, path: '/icloud'},
  secrets: {names: ['A', 'B']},
  sshKeys: ['key'],
  symlinks: [
    {exists: true, isValid: true, source: '/s1', target: '/home/.gitconfig'},
    {
      error: 'Symlink points to wrong source: /x',
      exists: true,
      isValid: false,
      source: '/s2',
      target: '/home/.zprofile',
    },
  ],
}

const DAEMON = {
  installed: true,
  intervalSeconds: 86_400,
  loaded: true,
  logPath: '/log',
  plistPath: '/plist',
  recentLog: ['synced'],
}

describe('dashboard', () => {
  beforeEach(() => installFakeEventSource())
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('summarises this machine', async () => {
    mockApi({'GET /api/daemon': [200, DAEMON], 'GET /api/status': [200, STATUS]})
    renderWithToasts(<Dashboard />)

    expect(await screen.findByText('1 / 2 linked')).toBeTruthy()
    expect(screen.getByText('acme')).toBeTruthy()
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByText('Symlinks that need attention')).toBeTruthy()
    expect(screen.getByText(/wrong source/)).toBeTruthy()
  })

  it('runs a sync job and lists its steps', async () => {
    const calls = mockApi({
      'GET /api/daemon': [200, DAEMON],
      'GET /api/status': [200, STATUS],
      'POST /api/jobs/sync': [202, {events: [], id: 'job-1', kind: 'sync', status: 'running'}],
    })
    renderWithToasts(<Dashboard />)

    fireEvent.click(await screen.findByLabelText('Dry run'))
    fireEvent.click(screen.getByText('Sync now'))
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
    expect(calls.find((c) => c.route === 'POST /api/jobs/sync')?.body).toEqual({dryRun: true})
    expect(FakeEventSource.instances[0].url).toBe('/api/jobs/job-1/events')

    act(() =>
      FakeEventSource.instances[0].emit('end', {
        result: {ok: true, steps: [{label: 'Organization acme', ok: true}]},
        status: 'succeeded',
      }),
    )
    expect(await screen.findByText('Organization acme')).toBeTruthy()
    expect(FakeEventSource.instances[0].closed).toBe(true)
  })
})

describe('daemon page', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('installs with the chosen interval', async () => {
    const calls = mockApi({
      'GET /api/daemon': [200, {...DAEMON, installed: false, intervalSeconds: null, loaded: false, recentLog: []}],
      'PUT /api/daemon': [200, {intervalSeconds: 3600, loaded: true, nodePath: '/node', plistPath: '/plist'}],
    })
    renderWithToasts(<DaemonPage />)

    fireEvent.click(await screen.findByLabelText('hour'))
    fireEvent.click(screen.getByText('Install'))
    await waitFor(() => expect(calls.some((c) => c.route === 'PUT /api/daemon')).toBe(true))
    expect(calls.find((c) => c.route === 'PUT /api/daemon')?.body).toEqual({intervalSeconds: 3600})
  })

  it('asks before uninstalling', async () => {
    const calls = mockApi({'DELETE /api/daemon': [200, {removed: true}], 'GET /api/daemon': [200, DAEMON]})
    renderWithToasts(<DaemonPage />)

    expect(await screen.findByText('synced')).toBeTruthy()
    fireEvent.click(screen.getByText('Uninstall'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(calls.some((c) => c.route === 'DELETE /api/daemon')).toBe(false)

    fireEvent.click(screen.getAllByText('Uninstall').at(-1) as HTMLElement)
    await waitFor(() => expect(calls.some((c) => c.route === 'DELETE /api/daemon')).toBe(true))
  })

  it('formats intervals', () => {
    expect([3600, 7200, 86_400, 172_800, 900].map(formatInterval)).toEqual([
      'hour',
      '2 hours',
      'day',
      '2 days',
      '15 min',
    ])
  })
})
