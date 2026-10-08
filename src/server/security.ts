import {timingSafeEqual} from 'node:crypto'

import type {MiddlewareHandler} from 'hono'

import {getCookie} from 'hono/cookie'

/**
 * The server holds the keys to the Keychain, the config and every repository,
 * so it has to make sure each request comes from the browser tab that
 * `dotsloth ui` opened:
 *
 * - It listens on 127.0.0.1 only.
 * - Host must name this server. A malicious site could otherwise point its
 *   own domain at 127.0.0.1 (DNS rebinding) and read responses same-origin.
 * - Every request needs the session cookie. The browser gets it once, by
 *   opening the URL with the random token that `dotsloth ui` printed.
 * - Requests that change something must carry this server's Origin, so
 *   another site cannot make the browser send them (CSRF); the cookie is
 *   SameSite=Strict as a second line.
 */

export const cookieName = (port: number) => `dotsloth_session_${port}`

export function allowedHosts(port: number): Set<string> {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`])
}

export function tokensMatch(given: string | undefined, expected: string): boolean {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function checkHost(port: () => number): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header('host')
    if (!host || !allowedHosts(port()).has(host)) return c.text('Forbidden host', 403)
    await next()
  }
}

export function checkOrigin(port: () => number): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const origin = c.req.header('origin')
      const allowed = [...allowedHosts(port())].map((host) => `http://${host}`)
      if (!origin || !allowed.includes(origin))
        return c.json({code: 'FORBIDDEN', details: [], message: 'Cross-origin request refused'}, 403)
    }

    await next()
  }
}

export function requireSession(token: string, port: () => number): MiddlewareHandler {
  return async (c, next) => {
    if (!tokensMatch(getCookie(c, cookieName(port())), token)) {
      if (c.req.path.startsWith('/api/')) {
        return c.json({code: 'UNAUTHORIZED', details: [], message: 'Open the link printed by "dotsloth ui"'}, 401)
      }

      return c.html(
        '<!doctype html><title>dotsloth</title><p>Open the link that <code>dotsloth ui</code> printed in your terminal.</p>',
        401,
      )
    }

    await next()
  }
}

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  // The first URL carries the session token; never pass it on.
  c.header('Referrer-Policy', 'no-referrer')
  c.header('Cache-Control', 'no-store')
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  )
}
