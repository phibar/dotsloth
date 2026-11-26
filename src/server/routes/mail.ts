import {Hono} from 'hono'

import {getMailStatus, planMailRestore} from '../../core/mail.js'

/**
 * Purpose: the web UI shows the Mail backup and what a restore would
 * recreate.
 *
 * Intention: calls core/mail.
 */

/** Each call drives Mail via AppleScript, so the UI only calls these on request. */
export const mailRoutes = new Hono()
  .get('/', (c) => c.json(getMailStatus()))
  .get('/restore-plan', (c) => c.json(planMailRestore()))
