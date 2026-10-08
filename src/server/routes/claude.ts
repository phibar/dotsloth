import {Hono} from 'hono'
import {z} from 'zod'

import {getClaudeStatus, linkClaude, planHistorySync, planMemorySync} from '../../core/claude.js'
import {CoreError} from '../../core/errors.js'
import {readBody} from '../body.js'

const Direction = z.enum(['status', 'push', 'pull'])

function direction(value: string | undefined): 'pull' | 'push' | 'status' {
  const parsed = Direction.safeParse(value ?? 'status')
  if (!parsed.success) throw new CoreError('INVALID_INPUT', 'direction must be status, push or pull')
  return parsed.data
}

export const claudeRoutes = new Hono()
  .get('/', (c) => c.json(getClaudeStatus()))
  .post('/link', async (c) => {
    const {dryRun} = await readBody(c, z.object({dryRun: z.boolean().optional()}).strict())
    return c.json(await linkClaude({dryRun}))
  })
  .get('/memory/plan', (c) => c.json(planMemorySync(direction(c.req.query('direction')))))
  .get('/history/plan', (c) => {
    const retention = c.req.query('retention')
    return c.json(
      planHistorySync(direction(c.req.query('direction')), retention ? {retentionDays: Number(retention)} : {}),
    )
  })
