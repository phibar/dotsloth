import {act, cleanup, fireEvent, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {FakeEventSource, installFakeEventSource, mockApi, renderWithToasts} from '../test-utils.js'
import {Dashboard} from './dashboard.js'

/**
 * Purpose: the dashboard sums up this machine and runs a sync, listing
 * its steps.
 *
 * Intention: renders the page against mockApi's answers and drives the
 * job's SSE stream with FakeEventSource.
 */

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
