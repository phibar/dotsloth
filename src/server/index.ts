import {randomBytes} from 'node:crypto'
import type {AddressInfo} from 'node:net'

import {serve} from '@hono/node-server'

import {createApp} from './app.js'

export interface RunningServer {
  close: () => Promise<void>
  port: number
  /** Opening this URL signs the browser in. */
  url: string
}

/** Start the web UI server on 127.0.0.1. Port 0 picks a free one. */
export function startServer({port = 0} = {}): Promise<RunningServer> {
  const token = randomBytes(32).toString('base64url')
  let actualPort = port
  const app = createApp({port: () => actualPort, token})

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
