import {cleanup, fireEvent, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {mockApi, renderWithToasts} from '../test-utils.js'
import {DaemonPage} from './daemon.js'
import {formatInterval} from './dashboard.js'

/**
 * Purpose: the periodic sync is installed with the chosen interval and
 * removed only after asking.
 *
 * Intention: renders the page against mockApi's answers.
 */

const DAEMON = {
  installed: true,
  intervalSeconds: 86_400,
  loaded: true,
  logPath: '/log',
  plistPath: '/plist',
  recentLog: ['synced'],
}

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
