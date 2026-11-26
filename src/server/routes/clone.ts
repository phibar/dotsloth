import {Hono} from 'hono'
import {z} from 'zod'

import {planClone} from '../../core/clone.js'
import {planOrgClone} from '../../core/clone-org.js'
import {readBody} from '../body.js'

/**
 * Purpose: the web UI plans a clone of a repository or an organisation
 * before it runs.
 *
 * Intention: calls core/clone and core/clone-org.
 */
const PlanBody = z.object({org: z.string().optional(), url: z.string()}).strict()

export const OrgFilter = z.object({
  includeArchived: z.boolean().optional(),
  includeForks: z.boolean().optional(),
  org: z.string().optional(),
  owner: z.string(),
  topics: z.array(z.string()).optional(),
})

export const cloneRoutes = new Hono()
  .post('/plan', async (c) => {
    const {org, url} = await readBody(c, PlanBody)
    return c.json(planClone(url, {org}))
  })
  .post('/org-plan', async (c) => {
    const {owner, ...filter} = await readBody(c, OrgFilter.strict())
    return c.json(await planOrgClone(owner, filter))
  })
