import {Hono} from 'hono'
import {setCookie} from 'hono/cookie'

import {toApiError} from './errors.js'
import {JobRunner} from './jobs.js'
import {configRoutes} from './routes/config.js'
import {jobRoutes} from './routes/jobs.js'
import {statusRoutes} from './routes/status.js'
import {checkHost, checkOrigin, cookieName, requireSession, securityHeaders, tokensMatch} from './security.js'

export interface AppOptions {
  /** The port the server listens on - known only once it is listening. */
  port: () => number
  /** The secret the opened URL carries. */
  token: string
}

export function createApp({port, token}: AppOptions) {
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
  app.route('/api/jobs', jobRoutes(runner))
  app.all('/api/*', (c) => c.json({code: 'NOT_FOUND', details: [], message: 'No such endpoint'}, 404))

  app.get('/', (c) =>
    c.html('<!doctype html><title>dotsloth</title><p>dotsloth ui is running. The web app arrives with #68.</p>'),
  )

  app.onError((error, c) => {
    const {body, status} = toApiError(error)
    if (body.code === 'INTERNAL') console.error('dotsloth ui:', error)
    return c.json(body, status)
  })

  return app
}
