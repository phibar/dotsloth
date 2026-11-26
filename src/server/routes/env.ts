import {Hono} from 'hono'

import {scanEnv} from '../../core/env.js'

/**
 * Purpose: the web UI lists the env files and whether each is saved.
 *
 * Intention: calls core/env.
 */
export const envRoutes = new Hono().get('/', (c) => c.json(scanEnv({unsavedOnly: c.req.query('unsaved') === 'true'})))
