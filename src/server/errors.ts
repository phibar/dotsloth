import type {ContentfulStatusCode} from 'hono/utils/http-status'

import {CoreError, type CoreErrorCode} from '../core/errors.js'

/** The JSON body of every API error. */
export interface ApiError {
  code: 'INTERNAL' | CoreErrorCode
  details: string[]
  message: string
}

const STATUS: Record<CoreErrorCode, ContentfulStatusCode> = {
  COMMAND_FAILED: 502,
  CONFIG_INVALID: 422,
  CONFIG_MISSING: 404,
  CONFLICT: 409,
  ICLOUD_UNAVAILABLE: 503,
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  ORG_EXISTS: 409,
  ORG_NOT_FOUND: 404,
  UNSAFE_PATH: 400,
}

/**
 * A CoreError keeps its code and message. Anything else is unexpected, and
 * its message stays out of the response: it may contain paths or values.
 */
export function toApiError(error: unknown): {body: ApiError; status: ContentfulStatusCode} {
  if (error instanceof CoreError) {
    return {body: {code: error.code, details: error.details, message: error.message}, status: STATUS[error.code]}
  }

  return {
    body: {code: 'INTERNAL', details: [], message: 'Unexpected error - see the dotsloth ui terminal'},
    status: 500,
  }
}
