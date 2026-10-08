import {act, cleanup, fireEvent, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {FakeEventSource, installFakeEventSource, mockApi, renderWithToasts} from '../test-utils.js'
import {EnvPage} from './env.js'
import {REVEAL_SECONDS, SecretsPage} from './secrets.js'

describe('secrets page', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('lists names with masked values and hides a revealed value again', async () => {
    const calls = mockApi({
      'GET /api/secrets': [200, {names: ['API_TOKEN']}],
      'POST /api/secrets/API_TOKEN/reveal': [200, {value: 'sk-123'}],
    })
    renderWithToasts(<SecretsPage />)

    expect(await screen.findByText('API_TOKEN')).toBeTruthy()
    expect(screen.queryByText('sk-123')).toBeNull()
    expect(calls.some((c) => c.route.includes('reveal'))).toBe(false)

    vi.useFakeTimers({shouldAdvanceTime: true})
    fireEvent.click(screen.getByText('Reveal'))
    expect(await screen.findByText('sk-123')).toBeTruthy()

    await act(() => vi.advanceTimersByTimeAsync((REVEAL_SECONDS - 1) * 1000))
    expect(screen.getByText('sk-123')).toBeTruthy()
    expect(screen.getByText('hides in 1s')).toBeTruthy()
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(screen.queryByText('sk-123')).toBeNull()
  })

  it('copies a value without showing it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {clipboard: {writeText}})
    mockApi({
      'GET /api/secrets': [200, {names: ['API_TOKEN']}],
      'POST /api/secrets/API_TOKEN/reveal': [200, {value: 'sk-123'}],
    })
    renderWithToasts(<SecretsPage />)

    fireEvent.click(await screen.findByText('Copy'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('sk-123'))
    expect(screen.queryByText('sk-123')).toBeNull()
  })

  it('stores a new secret upper-cased, and replaces an existing one explicitly', async () => {
    const calls = mockApi({
      'GET /api/secrets': [200, {names: ['API_TOKEN']}],
      'POST /api/secrets': [201, {created: false, name: 'API_TOKEN'}],
    })
    renderWithToasts(<SecretsPage />)

    fireEvent.change(await screen.findByLabelText('Name'), {target: {value: 'api_token'}})
    fireEvent.change(screen.getByLabelText('Value'), {target: {value: 'new'}})
    expect(screen.getByText(/exists and will be replaced/)).toBeTruthy()
    fireEvent.click(screen.getByText('Replace'))

    await waitFor(() => expect(calls.some((c) => c.route === 'POST /api/secrets')).toBe(true))
    expect(calls.find((c) => c.route === 'POST /api/secrets')?.body).toEqual({
      name: 'API_TOKEN',
      overwrite: true,
      value: 'new',
    })
  })
})

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
