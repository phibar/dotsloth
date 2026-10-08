import {Hono} from 'hono'
import {z} from 'zod'

import {CoreError} from '../../core/errors.js'
import {addOrg, listOrgs, removeOrg, updateOrg} from '../../core/orgs.js'
import {readBody} from '../body.js'

const AddBody = z
  .object({
    folderName: z.string().optional(),
    gitEmail: z.string(),
    gitUsername: z.string(),
    name: z.string(),
    overwrite: z.boolean().optional(),
    signingKey: z.string().optional(),
  })
  .strict()

const UpdateBody = z
  .object({gitEmail: z.string().optional(), gitUsername: z.string().optional(), signingKey: z.string().optional()})
  .strict()

const RemoveBody = z.object({confirm: z.string().optional(), deleteRepos: z.boolean().optional()}).strict()

export const orgRoutes = new Hono()
  .get('/', (c) => c.json(listOrgs()))
  .post('/', async (c) => {
    const {overwrite, ...input} = await readBody(c, AddBody)
    return c.json(await addOrg(input, {overwrite}), 201)
  })
  .put('/:name', async (c) => c.json(await updateOrg(c.req.param('name'), await readBody(c, UpdateBody))))
  .delete('/:name', async (c) => {
    const name = c.req.param('name')
    const {confirm, deleteRepos = false} = await readBody(c, RemoveBody)
    // Deleting repositories is irreversible: the client must echo the org
    // name, so no stray or forged request can do it.
    if (deleteRepos && confirm !== name) {
      throw new CoreError('INVALID_INPUT', 'Deleting repositories requires confirming with the organization name')
    }

    return c.json(await removeOrg(name, {deleteRepos}))
  })
