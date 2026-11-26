import {cleanup, fireEvent, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {installFakeEventSource, mockApi, renderWithToasts} from '../test-utils.js'
import {ClaudePage} from './claude.js'

/**
 * Purpose: the Claude page shows the shared settings and pushes memory
 * only after its preview.
 *
 * Intention: renders the page against mockApi's answers and drives the
 * job's SSE stream with FakeEventSource.
 */

beforeEach(() => installFakeEventSource())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
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
