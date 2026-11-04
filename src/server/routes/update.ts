/*
 * Purpose: Expose the update check result to the web UI.
 * Intention: uses checkForUpdate from lib/update-check; consumed by the web app via GET /api/update.
 */

import {Hono} from 'hono'

import {checkForUpdate} from '../../lib/update-check.js'

export function updateRoutes(version: string) {
  return new Hono().get('/', async (c) => {
    const update = await checkForUpdate(version).catch(() => null)
    return c.json(update)
  })
}
