import {Hono} from 'hono'

import {getStatus} from '../../core/status.js'

/**
 * Purpose: the web UI shows whether this machine is in the state dotsloth
 * keeps.
 *
 * Intention: calls core/status.
 */
export const statusRoutes = new Hono().get('/', (c) => c.json(getStatus()))
