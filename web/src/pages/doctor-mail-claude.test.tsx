import {act, cleanup, fireEvent, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {FakeEventSource, installFakeEventSource, mockApi, renderWithToasts} from '../test-utils.js'
import {ClaudePage} from './claude.js'
import {DoctorPage} from './doctor.js'
import {MailPage} from './mail.js'

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

describe('claude page', () => {
  it('shows shared settings and pushes memory after a preview', async () => {
    const memoryPlan = {
      changes: 1,
      projects: [{files: [{action: 'merge', name: 'MEMORY.md', state: 'differs'}], key: 'acme/web'}],
      store: '/store',
      unkeyed: 0,
    }
    const history = {
      log: {localEntries: 1, mergedEntries: 1, storeEntries: 0},
      projects: [],
      retentionDays: 90,
      sessionCount: 0,
      skippedActive: 0,
      skippedOld: 0,
      store: '/s',
    }
    const calls = mockApi({
      'GET /api/claude': [200, {files: [{name: 'settings.json', state: 'shared'}], installed: true, store: '/store'}],
      'GET /api/claude/history/plan?direction=status&retention=90': [200, history],
      'GET /api/claude/memory/plan?direction=push': [200, memoryPlan],
      'GET /api/claude/memory/plan?direction=status': [200, memoryPlan],
      'POST /api/jobs/claude-memory': [202, {id: 'job', status: 'running'}],
    })
    renderWithToasts(<ClaudePage />)

    expect(await screen.findByText('shared')).toBeTruthy()
    expect(await screen.findAllByText('acme/web')).toBeTruthy()

    fireEvent.click(screen.getAllByText('Push preview')[0])
    fireEvent.click(await screen.findByText('Push 1 file(s)'))
    await waitFor(() => expect(calls.some((c) => c.route === 'POST /api/jobs/claude-memory')).toBe(true))
    expect(calls.find((c) => c.route === 'POST /api/jobs/claude-memory')?.body).toEqual({direction: 'push'})
  })
})
