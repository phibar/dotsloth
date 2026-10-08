import {useEffect, useState} from 'react'

import {api, type SyncResult} from '../api.js'
import {useToast} from '../toast.js'
import {useJob} from '../use-job.js'
import {Button, Card, Dot} from './ui.js'

/** "Sync now": runs a sync job and lists each step as it reports back. */
export function SyncPanel({onDone}: {onDone?: () => void}) {
  const toast = useToast()
  const [jobId, setJobId] = useState<null | string>(null)
  const [dryRun, setDryRun] = useState(false)
  const job = useJob<never, SyncResult>(jobId)

  useEffect(() => {
    if (job.status === 'failed') toast.error(new Error(job.error?.message ?? 'Sync failed'))
    if (job.status === 'succeeded' || job.status === 'failed') onDone?.()
  }, [job.status, job.error, onDone, toast])

  const start = async () => {
    try {
      setJobId((await api.jobs.sync({dryRun})).id)
    } catch (error) {
      toast.error(error)
    }
  }

  return (
    <Card
      actions={
        <>
          <label className="inline">
            <input checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} type="checkbox" /> Dry run
          </label>
          <Button busy={job.status === 'running'} onClick={start} variant="primary">
            Sync now
          </Button>
        </>
      }
      title="Sync"
    >
      <p className="muted">
        Regenerates the gitconfigs from the config, updates allowed_signers and re-links the dotfiles.
      </p>
      {job.result && (
        <ul className="steps">
          {job.result.steps.map((step) => (
            <li key={`${step.label}-${step.detail}`}>
              <Dot tone={step.ok ? 'ok' : 'error'} /> {step.label}
              {step.detail && <span className="muted"> — {step.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
