import {Hono} from 'hono'
import {z} from 'zod'

import {listSecretNames, removeSecret, revealSecret, setSecret} from '../../core/secrets.js'
import {readBody} from '../body.js'

const SetBody = z.object({name: z.string(), overwrite: z.boolean().optional(), value: z.string()}).strict()

/**
 * Names freely, values one at a time. There is deliberately no endpoint that
 * returns several values: core does not even offer it.
 */
export const secretRoutes = new Hono()
  .get('/', (c) => c.json({names: listSecretNames()}))
  .post('/', async (c) => {
    const {name, overwrite, value} = await readBody(c, SetBody)
    return c.json(setSecret(name, value, {overwrite}), 201)
  })
  .delete('/:name', (c) => c.json(removeSecret(c.req.param('name'))))
  // POST, not GET: the Origin check applies, and nothing prefetches or caches it.
  .post('/:name/reveal', (c) => c.json({value: revealSecret(c.req.param('name'))}))
