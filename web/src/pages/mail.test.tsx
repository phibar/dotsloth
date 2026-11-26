import {cleanup, fireEvent, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {installFakeEventSource, mockApi, renderWithToasts} from '../test-utils.js'
import {MailPage} from './mail.js'

/**
 * Purpose: the Mail page touches Mail only when asked, and a restore
 * creates only what is missing after its preview.
 *
 * Intention: renders the page against mockApi's answers and drives the
 * job's SSE stream with FakeEventSource.
 */

beforeEach(() => installFakeEventSource())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('mail page', () => {
  it('does not touch Mail until asked', async () => {
    const calls = mockApi({
      'GET /api/mail': [
        200,
        {
          exported: {counts: {accounts: 2, rules: 1, signatures: 1}, exportedAt: '2026-01-01T00:00:00.000Z'},
          installed: true,
          local: {accounts: 1, rules: 1, signatures: 1},
          missingAccounts: [{name: 'Home', user: 'me'}],
          store: '/store',
        },
      ],
    })
    renderWithToasts(<MailPage />)
    expect(calls).toHaveLength(0)

    fireEvent.click(screen.getByText('Compare with Mail'))
    expect(await screen.findByText(/Not configured here: Home \(me\)/)).toBeTruthy()
    expect(calls.map((c) => c.route)).toEqual(['GET /api/mail'])
  })

  it('previews a restore and creates only what is missing', async () => {
    const calls = mockApi({
      'GET /api/mail/restore-plan': [
        200,
        {
          accounts: [{account: {name: 'Work', type: 'imap', user: 'me'}, howToAdd: 'System Settings', present: false}],
          exportedAt: 'x',
          rules: [{action: 'blocked', conditions: 0, moveTo: 'Archive', name: 'Move'}],
          signatures: [
            {action: 'create', name: 'New sig'},
            {action: 'present', name: 'Old sig'},
          ],
        },
      ],
      'POST /api/jobs/mail-restore': [202, {id: 'job', status: 'running'}],
    })
    renderWithToasts(<MailPage />)

    fireEvent.click(screen.getByText('Show restore plan'))
    expect(await screen.findByText('needs its mailbox first')).toBeTruthy()
    fireEvent.click(screen.getByText('Create 1 item(s) in Mail'))
    await waitFor(() => expect(calls.some((c) => c.route === 'POST /api/jobs/mail-restore')).toBe(true))
    expect(calls.find((c) => c.route === 'POST /api/jobs/mail-restore')?.body).toEqual({})
  })
})
