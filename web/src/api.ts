import type {CloneEvent, ClonePlan, CloneResult, CloneTarget} from '../../src/core/clone.js'
import type {DaemonStatus, InstallDaemonResult} from '../../src/core/daemon.js'
import type {EnvEntry, EnvTransfer, EnvTransferOptions, EnvTransferResult} from '../../src/core/env.js'
import type {AddOrgResult, OrgInfo, OrgInput, RemoveOrgResult, UpdateOrgResult} from '../../src/core/orgs.js'
import type {Status} from '../../src/core/status.js'
import type {SyncOptions, SyncResult} from '../../src/core/sync.js'
import type {ApiError as ApiErrorBody} from '../../src/server/errors.js'
import type {JobSnapshot} from '../../src/server/jobs.js'
import type {DevSlothConfig} from '../../src/types/index.js'

// Result types come straight from the server code (type-only imports), so the
// UI and the API cannot drift apart unnoticed.
export type {
  AddOrgResult,
  CloneEvent,
  ClonePlan,
  CloneResult,
  CloneTarget,
  DaemonStatus,
  DevSlothConfig,
  EnvEntry,
  EnvTransfer,
  EnvTransferResult,
  InstallDaemonResult,
  JobSnapshot,
  OrgInfo,
  OrgInput,
  Status,
  SyncResult,
}

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

async function send<T>(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{data: T; response: Response}> {
  const response = await fetch(path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    headers: body === undefined ? headers : {'content-type': 'application/json', ...headers},
    method,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(response.status, data)
  return {data: data as T, response}
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  return (await send<T>(method, path, body)).data
}

/** The config plus the version (ETag) it was read at. */
export interface VersionedConfig {
  config: DevSlothConfig
  version: string
}

const versioned = ({data, response}: {data: DevSlothConfig; response: Response}): VersionedConfig => ({
  config: data,
  version: (response.headers.get('etag') ?? '').replaceAll('"', ''),
})

export const api = {
  clone: {
    plan: (url: string) => call<ClonePlan>('POST', '/api/clone/plan', {url}),
  },
  config: {
    get: async () => versioned(await send<DevSlothConfig>('GET', '/api/config')),
    /** Refused with 409 when the file changed since `version` was read. */
    put: async (config: DevSlothConfig, version: string) =>
      versioned(await send<DevSlothConfig>('PUT', '/api/config', config, {'if-match': `"${version}"`})),
  },
  daemon: {
    get: () => call<DaemonStatus>('GET', '/api/daemon'),
    install: (intervalSeconds: number) => call<InstallDaemonResult>('PUT', '/api/daemon', {intervalSeconds}),
    uninstall: () => call<{removed: boolean}>('DELETE', '/api/daemon'),
  },
  env: {
    scan: () => call<{entries: EnvEntry[]; githubRoot: string}>('GET', '/api/env'),
  },
  jobs: {
    clone: (url: string, target?: CloneTarget) => call<JobSnapshot>('POST', '/api/jobs/clone', {target, url}),
    envPull: (options: EnvTransferOptions) => call<JobSnapshot>('POST', '/api/jobs/env-pull', options),
    envPush: (options: EnvTransferOptions) => call<JobSnapshot>('POST', '/api/jobs/env-push', options),
    get: (id: string) => call<JobSnapshot>('GET', `/api/jobs/${id}`),
    sync: (options: SyncOptions = {}) => call<JobSnapshot>('POST', '/api/jobs/sync', options),
  },
  orgs: {
    add: (input: OrgInput) => call<AddOrgResult>('POST', '/api/orgs', input),
    list: () => call<OrgInfo[]>('GET', '/api/orgs'),
    remove: (name: string, options: {confirm?: string; deleteRepos?: boolean} = {}) =>
      call<RemoveOrgResult>('DELETE', `/api/orgs/${encodeURIComponent(name)}`, options),
    update: (name: string, changes: Partial<Pick<OrgInput, 'gitEmail' | 'gitUsername' | 'signingKey'>>) =>
      call<UpdateOrgResult>('PUT', `/api/orgs/${encodeURIComponent(name)}`, changes),
  },
  secrets: {
    list: () => call<{names: string[]}>('GET', '/api/secrets'),
    remove: (name: string) => call<{name: string}>('DELETE', `/api/secrets/${encodeURIComponent(name)}`),
    reveal: async (name: string) =>
      (await call<{value: string}>('POST', `/api/secrets/${encodeURIComponent(name)}/reveal`)).value,
    set: (name: string, value: string, overwrite = false) =>
      call<{created: boolean; name: string}>('POST', '/api/secrets', {name, overwrite, value}),
  },
  status: () => call<Status>('GET', '/api/status'),
}
