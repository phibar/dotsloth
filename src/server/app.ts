import * as fs from 'node:fs'
import * as path from 'node:path'

import {serveStatic} from '@hono/node-server/serve-static'
import {Hono} from 'hono'
import {setCookie} from 'hono/cookie'

import {toApiError} from './errors.js'
import {JobRunner} from './jobs.js'
import {cloneRoutes} from './routes/clone.js'
import {configRoutes} from './routes/config.js'
import {daemonRoutes} from './routes/daemon.js'
import {jobRoutes} from './routes/jobs.js'
import {orgRoutes} from './routes/orgs.js'
import {statusRoutes} from './routes/status.js'
import {checkHost, checkOrigin, cookieName, requireSession, securityHeaders, tokensMatch} from './security.js'

export interface AppOptions {
  /** The port the server listens on - known only once it is listening. */
  port: () => number
  /** The secret the opened URL carries. */
  token: string
  /** The built web app (dist/web); null when it has not been built. */
  webRoot?: null | string
}

const NOT_BUILT =
  '<!doctype html><title>dotsloth</title><p>The web app has not been built. Run <code>npm run build</code>.</p>'

export function createApp({port, token, webRoot = null}: AppOptions) {
  const runner = new JobRunner()
  const app = new Hono()

  app.use(securityHeaders)
  app.use(checkHost(port))
  app.use(checkOrigin(port))

  // Exchange the one-time URL token for an HttpOnly cookie, then drop the
  // token from the address bar so it does not linger in history.
  app.get('/', async (c, next) => {
    const given = c.req.query('token')
    if (given === undefined) return next()
    if (!tokensMatch(given, token)) return c.text('Invalid token - open the link printed by "dotsloth ui"', 401)

    setCookie(c, cookieName(port()), token, {httpOnly: true, path: '/', sameSite: 'Strict'})
    return c.redirect('/', 303)
  })

  app.use(requireSession(token, port))

  app.route('/api/status', statusRoutes)
  app.route('/api/config', configRoutes)
  app.route('/api/daemon', daemonRoutes)
  app.route('/api/orgs', orgRoutes)
  app.route('/api/clone', cloneRoutes)
  app.route('/api/jobs', jobRoutes(runner))
  app.all('/api/*', (c) => c.json({code: 'NOT_FOUND', details: [], message: 'No such endpoint'}, 404))

  if (webRoot) {
    const index = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8')
    app.use('*', serveStatic({root: webRoot}))
    // Anything else is a page of the single-page app.
    app.get('*', (c) => c.html(index))
  } else {
    app.get('*', (c) => c.html(NOT_BUILT, 503))
  }

  app.onError((error, c) => {
    const {body, status} = toApiError(error)
    if (body.code === 'INTERNAL') console.error('dotsloth ui:', error)
    return c.json(body, status)
  })

  return app
}
