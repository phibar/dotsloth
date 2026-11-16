/*
 * Purpose: Set up a new runner of an organization on this Mac from the browser.
 * Intention: uses api.runners.add (a job) and api.orgs.list, useGuarded and
 * useRunnerJob from runner-job; shows the job's steps in JobLog. Speaks to
 * the Runners page, which reloads its list once the job ends.
 */

import {useState} from 'react'

import {api} from '../../api.js'
import {JobLog} from '../../components/job-log.js'
import {Button, Card, useLoad} from '../../components/ui.js'
import {useToast} from '../../toast.js'
import {useGuarded, useRunnerJob} from './runner-job.js'

export function AddRunner({onAdded}: {onAdded: () => void}) {
  const toast = useToast()
  const guarded = useGuarded()
  const orgs = useLoad(api.orgs.list)
  const [org, setOrg] = useState('')
  const [name, setName] = useState('')
  const [labels, setLabels] = useState('')
  const {job, lines, setJobId} = useRunnerJob((ok) => {
    if (ok) toast.success('Runner added and started')
    onAdded()
  })

  const chosen = org || orgs.data?.[0]?.name || ''
  const extra = labels
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean)

  const add = guarded(async () => {
    setJobId((await api.runners.add({labels: extra, name: name.trim() || undefined, org: chosen})).id)
  })

  const button = (
    <Button busy={job.status === 'running'} disabled={!chosen} onClick={add} variant="primary">
      Add runner
    </Button>
  )

  return (
    <Card actions={button} title="Add a runner">
      <p className="muted">
        Downloads GitHub's runner, checks its SHA-256, registers it with the organization through <code>gh</code> (needs{' '}
        <code>admin:org</code>) and starts it as a LaunchAgent. Workflows use it with <code>runs-on: self-hosted</code>.
      </p>
      <label className="field">
        Organization
        <select onChange={(e) => setOrg(e.target.value)} value={chosen}>
          {orgs.data?.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Name
        <input onChange={(e) => setName(e.target.value)} placeholder="this Mac's host name" value={name} />
      </label>
      <label className="field">
        Extra labels
        <input onChange={(e) => setLabels(e.target.value)} placeholder="e2e, macos-build" value={labels} />
      </label>
      <JobLog lines={lines} />
    </Card>
  )
}
