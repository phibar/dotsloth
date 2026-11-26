import {afterEach, describe, expect, it, vi} from 'vitest'

import {ApiError, api} from './api.js'

/**
 * Purpose: the API client sends JSON and turns an error answer into an
 * ApiError carrying the server's code and details.
 *
 * Intention: replaces fetch with a stub that answers once and records
 * the request.
 */

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), {status}))
}

describe('api client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends JSON and turns error responses into ApiError with details', async () => {
    const fetch = respond(400, {code: 'INVALID_INPUT', details: ['version: Invalid input'], message: 'bad'})
    vi.stubGlobal('fetch', fetch)

    const error = await api.jobs.sync({dryRun: true}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({code: 'INVALID_INPUT', details: ['version: Invalid input'], status: 400})

    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/jobs/sync')
    expect(init).toMatchObject({body: '{"dryRun":true}', method: 'POST'})
  })
})
