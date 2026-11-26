import type {Context} from 'hono'
import type {z} from 'zod'

import {CoreError} from '../core/errors.js'

/**
 * Purpose: a request body is checked whole before any route uses it.
 *
 * Intention: parses the body with a strict Zod schema and turns a failure
 * into a CoreError; used by the routes.
 */

/** The JSON body, validated; a malformed one is a 400 with one line per problem. */
export async function readBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let data: unknown
  try {
    data = await c.req.json()
  } catch {
    throw new CoreError('INVALID_INPUT', 'Request body must be JSON')
  }

  const result = schema.safeParse(data)
  if (!result.success) {
    throw new CoreError(
      'INVALID_INPUT',
      'Invalid request',
      result.error.issues.map((issue) => `${issue.path.join('.') || '(body)'}: ${issue.message}`),
    )
  }

  return result.data
}
