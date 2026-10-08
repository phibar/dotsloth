import {Hono} from 'hono'

import {getStatus} from '../../core/status.js'

export const statusRoutes = new Hono().get('/', (c) => c.json(getStatus()))
