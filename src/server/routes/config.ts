import {Hono} from 'hono'

import {getConfig, replaceConfig} from '../../core/config.js'

export const configRoutes = new Hono()
  .get('/', (c) => c.json(getConfig()))
  // The body is validated by replaceConfig against the config schema.
  .put('/', async (c) => c.json(replaceConfig(await c.req.json().catch(() => null))))
