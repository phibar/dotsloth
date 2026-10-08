import {Hono} from 'hono'
import {z} from 'zod'

import {getDaemonStatus, installDaemon, MIN_INTERVAL_SECONDS, uninstallDaemon} from '../../core/daemon.js'
import {readBody} from '../body.js'

const InstallBody = z.object({intervalSeconds: z.number().int().min(MIN_INTERVAL_SECONDS)}).strict()

export const daemonRoutes = new Hono()
  .get('/', (c) => c.json(getDaemonStatus()))
  // Install, or reinstall with a new interval.
  .put('/', async (c) => c.json(installDaemon(await readBody(c, InstallBody))))
  .delete('/', (c) => c.json(uninstallDaemon()))
