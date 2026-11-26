import {act, cleanup, fireEvent, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {mockApi, renderWithToasts} from '../test-utils.js'
import {REVEAL_SECONDS, SecretsPage} from './secrets.js'

/**
 * Purpose: the secrets page shows names with masked values, reveals one
 * and hides it again, copies without showing, and stores a new name
 * upper-cased, replacing an existing one only explicitly.
 *
 * Intention: renders the page against mockApi's answers.
 */
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
