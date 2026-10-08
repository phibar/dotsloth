import type {DaemonStatus, InstallDaemonResult} from '../../src/core/daemon.js'
import type {Status} from '../../src/core/status.js'
import type {SyncOptions, SyncResult} from '../../src/core/sync.js'
import type {ApiError as ApiErrorBody} from '../../src/server/errors.js'
import type {JobSnapshot} from '../../src/server/jobs.js'
import type {DevSlothConfig} from '../../src/types/index.js'

// Result types come straight from the server code (type-only imports), so the
// UI and the API cannot drift apart unnoticed.
export type {DaemonStatus, DevSlothConfig, InstallDaemonResult, JobSnapshot, Status, SyncResult}

export class ApiError extends Error {
  readonly code: string
  readonly details: string[]
  readonly status: number

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.message ?? `Request failed (${status})`)
    this.name = 'ApiError'
    this.code = body.code ?? 'UNKNOWN'
    this.details = body.details ?? []
    this.status = status
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    headers: body === undefined ? undefined : {'content-type': 'application/json'},
    method,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(response.status, data)
  return data as T
}

export const api = {
  config: {
    get: () => call<DevSlothConfig>('GET', '/api/config'),
    put: (config: DevSlothConfig) => call<DevSlothConfig>('PUT', '/api/config', config),
  },
  daemon: {
    get: () => call<DaemonStatus>('GET', '/api/daemon'),
    install: (intervalSeconds: number) => call<InstallDaemonResult>('PUT', '/api/daemon', {intervalSeconds}),
    uninstall: () => call<{removed: boolean}>('DELETE', '/api/daemon'),
  },
  jobs: {
    get: (id: string) => call<JobSnapshot>('GET', `/api/jobs/${id}`),
    sync: (options: SyncOptions = {}) => call<JobSnapshot>('POST', '/api/jobs/sync', options),
  },
  status: () => call<Status>('GET', '/api/status'),
}
