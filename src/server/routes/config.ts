import {Hono} from 'hono'

import {getConfigWithVersion, replaceConfig} from '../../core/config.js'

/**
 * The config with optimistic concurrency: GET sends its version as ETag,
 * and a PUT carrying If-Match is refused (409) when the file changed since.
 */
export const configRoutes = new Hono()
  .get('/', (c) => {
    const {config, version} = getConfigWithVersion()
    c.header('ETag', `"${version}"`)
    return c.json(config)
  })
  .put('/', async (c) => {
    const ifMatch = c.req.header('if-match')?.replaceAll('"', '')
    // The body is validated by replaceConfig against the config schema.
    const saved = replaceConfig(await c.req.json().catch(() => null), {expectedVersion: ifMatch})
    c.header('ETag', `"${getConfigWithVersion().version}"`)
    return c.json(saved)
  })
