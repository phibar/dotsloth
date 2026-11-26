import {act, cleanup, fireEvent, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {FakeEventSource, installFakeEventSource, mockApi, renderWithToasts} from '../test-utils.js'
import {DoctorPage} from './doctor.js'

/**
 * Purpose: the doctor page shows progress, each repository at risk as
 * it arrives, and the verdict.
 *
 * Intention: renders the page against mockApi's answers and drives the
 * job's SSE stream with FakeEventSource.
 */

beforeEach(() => installFakeEventSource())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('doctor page', () => {
  it('shows progress, repos at risk as they arrive, and the verdict', async () => {
    const calls = mockApi({'POST /api/jobs/doctor': [202, {id: 'job', status: 'running'}]})
    renderWithToasts(<DoctorPage />)

    fireEvent.click(screen.getByLabelText(/Offline/))
    fireEvent.click(screen.getByText('Run check'))
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
    expect(calls[0].body).toEqual({offline: true})

    const source = FakeEventSource.instances[0]
    act(() => {
      source.emit('event', {githubRoot: '/gh', offline: true, repoCount: 2, type: 'start'})
      source.emit('event', {
        done: 1,
        path: '/gh/acme/web',
        repo: {branches: [], dirty: 2, path: '/gh/acme/web', relativePath: 'acme/web', stashes: 0},
        total: 2,
        type: 'repo',
      })
    })
    expect(screen.getByText('1 / 2 repositories')).toBeTruthy()
    expect(screen.getByText('acme/web')).toBeTruthy()
    expect(screen.getByText(/2 uncommitted change/)).toBeTruthy()

    act(() =>
      source.emit('end', {
        result: {envFiles: [], githubRoot: '/gh', icloudPending: 0, problems: 1, repoCount: 2, repos: [], safe: false},
        status: 'succeeded',
      }),
    )
    expect(screen.getByText(/1 area\(s\) need attention/)).toBeTruthy()
  })
})
