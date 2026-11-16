/*
 * Purpose: Show one runner of this Mac and steer it — start, stop, read its
 * log, remove it.
 * Intention: uses api.runners (start, stop, logs, and remove as a job),
 * useGuarded and useRunnerJob from runner-job, ConfirmDialog before a remove.
 * Speaks to the Runners page, which reloads its list after each change.
 */

import {useState} from 'react'

import {api, type RunnerInfo} from '../../api.js'
import {JobLog} from '../../components/job-log.js'
import {Button, Card, ConfirmDialog, Dot} from '../../components/ui.js'
import {useToast} from '../../toast.js'
import {useGuarded, useRunnerJob} from './runner-job.js'

function githubState(runner: RunnerInfo): string {
  if (!runner.github) return 'GitHub: unknown'
  return `GitHub: ${runner.github.status}${runner.github.busy ? ', busy' : ''}`
}

export function RunnerCard({onChange, runner}: {onChange: () => void; runner: RunnerInfo}) {
  const toast = useToast()
  const guarded = useGuarded()
  const [busy, setBusy] = useState(false)
  const [logs, setLogs] = useState<null | string[]>(null)
  const [confirming, setConfirming] = useState(false)
  const [force, setForce] = useState(false)
  const removal = useRunnerJob((ok) => {
    if (ok) toast.success(`Runner '${runner.name}' removed`)
    onChange()
  })

  const toggle = guarded(async () => {
    setBusy(true)
    try {
      await (runner.running ? api.runners.stop : api.runners.start)(runner.org, runner.name)
      onChange()
    } finally {
      setBusy(false)
    }
  })

  const showLogs = guarded(async () => setLogs((await api.runners.logs(runner.org, runner.name)).lines))

  const remove = guarded(async () => {
    setConfirming(false)
    removal.setJobId((await api.runners.remove(runner.org, runner.name, force)).id)
  })

  const buttons = (
    <>
      <Button onClick={showLogs}>Logs</Button>
      <Button busy={busy} disabled={!runner.serviceInstalled} onClick={toggle}>
        {runner.running ? 'Stop' : 'Start'}
      </Button>
      <Button busy={removal.job.status === 'running'} onClick={() => setConfirming(true)} variant="danger">
        Remove
      </Button>
    </>
  )

  return (
    <Card actions={buttons} title={`${runner.org} / ${runner.name}`}>
      <p>
        <Dot tone={runner.running ? 'ok' : 'warn'} /> {runner.running ? 'Running' : 'Stopped'}
        <span className="muted"> · {githubState(runner)}</span>
      </p>
      {runner.github && runner.github.labels.length > 0 && (
        <p className="muted small">Labels: {runner.github.labels.join(', ')}</p>
      )}
      <p className="muted small">
        <code>{runner.path}</code>
      </p>
      {logs && <pre className="log">{logs.length > 0 ? logs.join('\n') : '(no output yet)'}</pre>}
      <JobLog lines={removal.lines} />

      {confirming && (
        <ConfirmDialog
          confirmLabel="Remove"
          message={
            <>
              <p>
                Stops the service, deregisters <strong>{runner.name}</strong> from {runner.org} and deletes{' '}
                <code>{runner.path}</code>.
              </p>
              <label className="inline">
                <input checked={force} onChange={(e) => setForce(e.target.checked)} type="checkbox" /> Remove locally
                even if GitHub refuses
              </label>
            </>
          }
          onCancel={() => setConfirming(false)}
          onConfirm={remove}
          title={`Remove runner ${runner.name}?`}
        />
      )}
    </Card>
  )
}
