/*
 * Purpose: Let the web UI steer this Mac's self-hosted runners as the CLI does (#106).
 * Intention: uses the operations of core/runners; add and remove run as jobs
 * of the JobRunner it is given, so the browser follows their progress over
 * SSE. Request bodies are strict Zod schemas (readBody); mounted inside
 * createApp, so the security middleware covers every route.
 */

import {type Context, Hono} from 'hono'
import {z} from 'zod'

import {
  addRunner,
  DEFAULT_LOG_LINES,
  listRunners,
  removeRunner,
  runnerLogs,
  startRunner,
  stopRunner,
} from '../../core/runners.js'
import {readBody} from '../body.js'
import type {JobRunner} from '../jobs.js'

const AddBody = z
  .object({labels: z.array(z.string()).optional(), name: z.string().optional(), org: z.string()})
  .strict()
const RemoveBody = z.object({force: z.boolean().optional()}).strict()

const ref = (c: Context) => {
  const {name, org} = c.req.param()
  return {name, org}
}

export function runnerRoutes(jobs: JobRunner) {
  return new Hono()
    .get('/', async (c) => c.json(await listRunners({offline: c.req.query('offline') === '1'})))
    .post('/', async (c) => {
      const input = await readBody(c, AddBody)
      return c.json(
        jobs.start('runner-add', (emit) => addRunner(input, emit)),
        202,
      )
    })
    .post('/:org/:name/start', async (c) => c.json(await startRunner(ref(c))))
    .post('/:org/:name/stop', async (c) => c.json(await stopRunner(ref(c))))
    .get('/:org/:name/logs', (c) =>
      c.json(runnerLogs({...ref(c), lines: Number(c.req.query('lines') ?? DEFAULT_LOG_LINES)})),
    )
    .post('/:org/:name/remove', async (c) => {
      const {force} = await readBody(c, RemoveBody)
      return c.json(
        jobs.start('runner-remove', (emit) => removeRunner({...ref(c), force}, emit)),
        202,
      )
    })
}
