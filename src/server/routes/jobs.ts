import {Hono} from 'hono'
import {type SSEStreamingApi, streamSSE} from 'hono/streaming'
import {z} from 'zod'

import {clone} from '../../core/clone.js'
import {pullEnv, pushEnv} from '../../core/env.js'
import {CoreError} from '../../core/errors.js'
import {runSync} from '../../core/sync.js'
import {readBody} from '../body.js'
import {type JobRunner, UpdateQueue} from '../jobs.js'

const SyncBody = z.object({dryRun: z.boolean().optional(), force: z.boolean().optional()}).strict()

const CloneTarget = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('org'), name: z.string()}).strict(),
  z.object({gitEmail: z.string(), gitUsername: z.string(), kind: z.literal('new-org')}).strict(),
  z.object({kind: z.literal('none')}).strict(),
])

const EnvBody = z
  .object({dryRun: z.boolean().optional(), force: z.union([z.boolean(), z.array(z.string())]).optional()})
  .strict()

const CloneBody = z.object({org: z.string().optional(), target: CloneTarget.optional(), url: z.string()}).strict()

/**
 * Write a job's events from `from` on, then follow it until it ends. Events
 * carry their index as SSE id, so a reconnect resumes via Last-Event-ID.
 */
async function streamJob(stream: SSEStreamingApi, runner: JobRunner, id: string, from: number): Promise<void> {
  const queue = new UpdateQueue()
  // Subscribe before reading the snapshot, so no event can fall in between.
  const unsubscribe = runner.subscribe(id, (update) => queue.push(update))
  stream.onAbort(() => unsubscribe?.())

  const job = runner.get(id)
  const events = job?.events ?? []
  for (let index = from; index < events.length; index++) {
    // biome-ignore lint/performance/noAwaitInLoops: events must arrive in order
    await stream.writeSSE({data: JSON.stringify(events[index]), event: 'event', id: String(index)})
  }

  if (!unsubscribe) {
    await stream.writeSSE({data: JSON.stringify(job), event: 'end'})
    return
  }

  let written = Math.max(from, events.length)
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: one update at a time, in order
    const update = await queue.next()
    if (update.type === 'end') {
      await stream.writeSSE({data: JSON.stringify(update.job), event: 'end'})
      return
    }

    // Already sent with the snapshot above.
    if (update.index < written) continue
    written = update.index + 1
    await stream.writeSSE({data: JSON.stringify(update.event), event: 'event', id: String(update.index)})
  }
}

export function jobRoutes(runner: JobRunner) {
  return (
    new Hono()
      .post('/sync', async (c) => {
        const options = await readBody(c, SyncBody)
        return c.json(
          runner.start('sync', () => runSync(options)),
          202,
        )
      })
      // Never interactive: git cannot prompt a browser, so it is told not to.
      .post('/clone', async (c) => {
        const {org, target, url} = await readBody(c, CloneBody)
        return c.json(
          runner.start('clone', (emit) => clone(url, {org, target}, emit)),
          202,
        )
      })
      .post('/env-push', async (c) => {
        const options = await readBody(c, EnvBody)
        return c.json(
          runner.start('env-push', () => pushEnv(options)),
          202,
        )
      })
      .post('/env-pull', async (c) => {
        const options = await readBody(c, EnvBody)
        return c.json(
          runner.start('env-pull', () => pullEnv(options)),
          202,
        )
      })
      .get('/:id', (c) => {
        const job = runner.get(c.req.param('id'))
        if (!job) throw new CoreError('NOT_FOUND', 'No such job')
        return c.json(job)
      })
      .get('/:id/events', (c) => {
        const id = c.req.param('id')
        if (!runner.get(id)) throw new CoreError('NOT_FOUND', 'No such job')
        const lastEventId = Number(c.req.header('last-event-id'))
        const from = Number.isInteger(lastEventId) && lastEventId >= 0 ? lastEventId + 1 : 0
        return streamSSE(c, (stream) => streamJob(stream, runner, id, from))
      })
  )
}
