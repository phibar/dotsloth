import type {Hono} from 'hono'

import {createApp} from '../../src/server/app.js'
import {cookieName} from '../../src/server/security.js'

export const PORT = 4711
export const TOKEN = 'test-token-0123456789'
export const HOST = `127.0.0.1:${PORT}`
export const ORIGIN = `http://${HOST}`
export const COOKIE = `${cookieName(PORT)}=${TOKEN}`

export const testApp = (webRoot?: string) => createApp({port: () => PORT, token: TOKEN, webRoot})

/** A request as the signed-in browser tab sends it. */
export function signedIn(app: Hono, path: string, init: RequestInit & {headers?: Record<string, string>} = {}) {
  return app.request(path, {...init, headers: {cookie: COOKIE, host: HOST, ...init.headers}})
}

/** A JSON request that changes something: needs this server's Origin. */
export function mutate(
  app: Hono,
  {body, headers = {}, method, path}: {body?: unknown; headers?: Record<string, string>; method: string; path: string},
) {
  return signedIn(app, path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {'content-type': 'application/json', origin: ORIGIN, ...headers},
    method,
  })
}

/** Read an SSE response to the end and return its events as [name, data]. */
export async function readSse(response: Response): Promise<Array<[string, unknown]>> {
  const text = await response.text()
  return text
    .split('\n\n')
    .filter((block) => block.includes('data:'))
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message'
      const data = /^data: (.*)$/m.exec(block)?.[1] ?? 'null'
      return [event, JSON.parse(data)]
    })
}
