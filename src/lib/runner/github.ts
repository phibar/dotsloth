/*
 * Purpose: What GitHub knows about an organization's self-hosted runners, and
 * the short-lived tokens it hands out to register or remove one.
 * Intention: uses runAsync from exec to call the `gh` CLI, so the user's own
 * `gh` login (with admin:org) authorizes every call and dotsloth stores no
 * token. Speaks to core/runners.
 */

import {runAsync} from '../exec.js'

/** A runner as GitHub reports it. `status` is `online` or `offline`. */
export interface GithubRunner {
  busy: boolean
  labels: string[]
  name: string
  status: string
}

/** `Organization` or `User` — the org runner endpoints exist only for the former. */
export async function accountType(login: string): Promise<string> {
  return (await runAsync('gh', ['api', `users/${login}`, '--jq', '.type'])).trim()
}

/** A token for `config.sh`, valid for one hour and one registration. */
export async function registrationToken(org: string): Promise<string> {
  return (
    await runAsync('gh', ['api', '-X', 'POST', `orgs/${org}/actions/runners/registration-token`, '--jq', '.token'])
  ).trim()
}

/** A token for `config.sh remove`. */
export async function removeToken(org: string): Promise<string> {
  return (
    await runAsync('gh', ['api', '-X', 'POST', `orgs/${org}/actions/runners/remove-token`, '--jq', '.token'])
  ).trim()
}

export async function listGithubRunners(org: string): Promise<GithubRunner[]> {
  const raw = await runAsync('gh', [
    'api',
    '--paginate',
    `orgs/${org}/actions/runners?per_page=100`,
    '--jq',
    '.runners[] | {name, status, busy, labels: [.labels[].name]}',
  ])
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as GithubRunner)
}
