import {Hono} from 'hono'
import {z} from 'zod'

import {planClone} from '../../core/clone.js'
import {readBody} from '../body.js'

const PlanBody = z.object({org: z.string().optional(), url: z.string()}).strict()

export const cloneRoutes = new Hono().post('/plan', async (c) => {
  const {org, url} = await readBody(c, PlanBody)
  return c.json(planClone(url, {org}))
})
