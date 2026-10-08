import {randomBytes} from 'node:crypto'
import * as fs from 'node:fs'
import type {AddressInfo} from 'node:net'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'

import {serve} from '@hono/node-server'

import {createApp} from './app.js'

export interface RunningServer {
  close: () => Promise<void>
  port: number
  /** Opening this URL signs the browser in. */
  url: string
}

/**
 * dist/web next to this module once built (dist/server -> dist/web), or the
 * built copy when running from source (src/server -> dist/web).
 */
export function findWebRoot(): null | string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [path.resolve(here, '../web'), path.resolve(here, '../../dist/web')]
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) ?? null
}

/** Start the web UI server on 127.0.0.1. Port 0 picks a free one. */
export function startServer({port = 0} = {}): Promise<RunningServer> {
  const token = randomBytes(32).toString('base64url')
  let actualPort = port
  const app = createApp({port: () => actualPort, token, webRoot: findWebRoot()})

  return new Promise((resolve, reject) => {
    const server = serve({fetch: app.fetch, hostname: '127.0.0.1', port}, (info: AddressInfo) => {
      actualPort = info.port
      resolve({
        close: () =>
          new Promise((done) => {
            // Open SSE streams would otherwise keep close() waiting forever.
            ;(server as {closeAllConnections?: () => void}).closeAllConnections?.()
            server.close(() => done())
          }),
        port: info.port,
        url: `http://127.0.0.1:${info.port}/?token=${token}`,
      })
    })
    server.once('error', reject)
  })
}
