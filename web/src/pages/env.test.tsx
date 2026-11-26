import {act, cleanup, fireEvent, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {FakeEventSource, installFakeEventSource, mockApi, renderWithToasts} from '../test-utils.js'
import {EnvPage} from './env.js'

describe('env page', () => {
  beforeEach(() => installFakeEventSource())
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('previews a push, then overwrites only the ticked conflicts', async () => {
    const calls = mockApi({
      'GET /api/env': [
        200,
        {
          entries: [
            {key: 'acme/web/.env', org: 'acme', relativePath: '.env', repo: 'web', state: 'local-only'},
            {key: 'acme/web/.env.local', org: 'acme', relativePath: '.env.local', repo: 'web', state: 'differs'},
          ],
          githubRoot: '/gh',
        },
      ],
      'POST /api/jobs/env-push': [202, {id: 'job', status: 'running'}],
    })
    renderWithToasts(<EnvPage />)

    expect(await screen.findByText('acme/web')).toBeTruthy()
    expect(screen.getByText('not backed up')).toBeTruthy()

    fireEvent.click(screen.getAllByText('Preview')[0])
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
    expect(calls.find((c) => c.route === 'POST /api/jobs/env-push')?.body).toEqual({dryRun: true, force: []})
    act(() =>
      FakeEventSource.instances[0].emit('end', {
        result: {
          copied: 1,
          skipped: 1,
          transfers: [
            {key: 'acme/web/.env', outcome: 'would-copy'},
            {key: 'acme/web/.env.local', outcome: 'conflict'},
          ],
        },
        status: 'succeeded',
      }),
    )

    expect(await screen.findByText('Back up 1 file(s)')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByText('Back up 2 file(s)'))

    await waitFor(() => expect(calls.filter((c) => c.route === 'POST /api/jobs/env-push')).toHaveLength(2))
    expect(calls.filter((c) => c.route === 'POST /api/jobs/env-push')[1].body).toEqual({
      dryRun: false,
      force: ['acme/web/.env.local'],
    })
  })
})
