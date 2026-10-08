import {cleanup, fireEvent, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {changedHunks, lineDiff} from '../diff.js'
import {mockApi, renderWithToasts} from '../test-utils.js'
import {ConfigPage, validateConfigText} from './config.js'

const CONFIG = {
  organizations: [{folderName: 'acme', gitEmail: 'dev@acme.test', gitUsername: 'dev', name: 'acme'}],
  paths: {githubRoot: '/Users/me/github'},
  sshSigning: {defaultKeyPath: '/Users/me/.ssh/id_ed25519', enabled: true},
  syncedFiles: [{source: '/icloud/gitconfig', target: '/Users/me/.gitconfig'}],
  version: 1,
}

const STATUS = {
  config: {},
  icloud: {},
  secrets: {names: []},
  sshKeys: [],
  symlinks: [{isValid: true, target: '/Users/me/.gitconfig'}],
}

/** fetch stub that also returns an ETag, like the real server. */
function mockConfigApi(put: (body: unknown, ifMatch: null | string) => [number, unknown]) {
  const calls: Array<{body: unknown; ifMatch: null | string}> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url === '/api/status') return new Response(JSON.stringify(STATUS))
      if ((init.method ?? 'GET') === 'GET') return new Response(JSON.stringify(CONFIG), {headers: {etag: '"v1"'}})
      const body = JSON.parse(String(init.body))
      const ifMatch = new Headers(init.headers).get('if-match')
      calls.push({body, ifMatch})
      const [status, data] = put(body, ifMatch)
      return new Response(JSON.stringify(data), {headers: {etag: '"v2"'}, status})
    }),
  )
  return calls
}

describe('config editor', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('validates JSON with the server schema', () => {
    expect(validateConfigText('{').errors[0]).toMatch(/^Not valid JSON/)
    expect(validateConfigText(JSON.stringify({...CONFIG, version: 2})).errors[0]).toMatch(/^version:/)
    expect(validateConfigText(JSON.stringify(CONFIG)).config).toEqual(CONFIG)
  })

  it('diffs only the changed lines', () => {
    const lines = lineDiff('a\nb\nc\nd\ne\nf\ng', 'a\nb\nc\nD\ne\nf\ng')
    expect(lines.filter((l) => l.type !== 'same')).toEqual([
      {text: 'd', type: 'remove'},
      {text: 'D', type: 'add'},
    ])
    expect(changedHunks(lines, 1).map((l) => l?.text ?? '…')).toEqual(['c', 'd', 'D', 'e'])
  })

  it('edits in the form, shows the diff, and saves with the version it loaded', async () => {
    const calls = mockConfigApi((body) => [200, body])
    renderWithToasts(<ConfigPage />)

    const root = await screen.findByLabelText(/GitHub root/)
    expect(screen.getByRole('button', {name: 'Review and save'})).toHaveProperty('disabled', true)
    fireEvent.change(root, {target: {value: '/Users/me/code'}})
    fireEvent.click(screen.getByText('Review and save'))

    expect(screen.getByRole('dialog').textContent).toContain('- ')
    expect(screen.getByRole('dialog').textContent).toContain('"githubRoot": "/Users/me/code"')
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].ifMatch).toBe('"v1"')
    expect((calls[0].body as typeof CONFIG).paths.githubRoot).toBe('/Users/me/code')
    expect(await screen.findByText('Sync now')).toBeTruthy()
  })

  it('blocks saving invalid JSON and reports a conflict', async () => {
    const calls = mockConfigApi(() => [
      409,
      {code: 'CONFLICT', details: ['Reload'], message: 'config.json changed since it was loaded'},
    ])
    renderWithToasts(<ConfigPage />)

    fireEvent.click(await screen.findByText('JSON'))
    const editor = screen.getByLabelText('config.json')
    fireEvent.change(editor, {target: {value: '{"version": 2'}})
    expect(screen.getByText(/Not valid JSON/)).toBeTruthy()
    expect(screen.getByRole('button', {name: 'Review and save'})).toHaveProperty('disabled', true)

    fireEvent.change(editor, {target: {value: JSON.stringify({...CONFIG, defaultOrganization: 'acme'})}})
    fireEvent.click(screen.getByText('Review and save'))
    fireEvent.click(screen.getByText('Save'))

    expect(await screen.findByText('config.json changed since it was loaded')).toBeTruthy()
    expect(calls).toHaveLength(1)
  })
})
