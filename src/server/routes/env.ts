import {Hono} from 'hono'

import {scanEnv} from '../../core/env.js'

export const envRoutes = new Hono().get('/', (c) => c.json(scanEnv({unsavedOnly: c.req.query('unsaved') === 'true'})))
