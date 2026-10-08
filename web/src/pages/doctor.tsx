import {useEffect, useState} from 'react'

import {api, type DoctorEvent, type DoctorReport, type RepoAtRisk} from '../api.js'
import {Button, Card, Dot} from '../components/ui.js'
import {useToast} from '../toast.js'
import {useJob} from '../use-job.js'

export function DoctorPage() {
  const toast = useToast()
  const [offline, setOffline] = useState(false)
  const [jobId, setJobId] = useState<null | string>(null)
  const job = useJob<DoctorEvent, DoctorReport>(jobId)

  useEffect(() => {
    if (job.status === 'failed') toast.error(new Error(job.error?.message ?? 'Doctor failed'))
  }, [job.status, job.error, toast])

  const run = async () => {
    try {
      setJobId((await api.jobs.doctor(offline)).id)
    } catch (error) {
      toast.error(error)
    }
  }

  const start = job.events.find((e) => e.type === 'start')
  const progress = job.events.filter((e) => e.type === 'repo').at(-1)
  const atRisk = job.events.flatMap((e) => (e.type === 'repo' && e.repo ? [e.repo] : []))
  const report = job.result

  return (
    <>
      <Card
        actions={
          <>
            <label className="inline">
              <input checked={offline} onChange={(e) => setOffline(e.target.checked)} type="checkbox" /> Offline (skip
              GitHub lookups)
            </label>
            <Button busy={job.status === 'running'} onClick={run} variant="primary">
              Run check
            </Button>
          </>
        }
        title="Would anything be lost if this machine were wiped?"
      >
        <p className="muted">
          Looks for uncommitted work, stashes, unpushed branches (asking GitHub whether they were merged), env files
          that are not backed up, and iCloud uploads still in flight. Reads only.
        </p>
        {start && job.status === 'running' && (
          <div className="progress">
            <progress max={start.repoCount} value={progress?.type === 'repo' ? progress.done : 0} />
            <span className="muted small">
              {progress?.type === 'repo' ? progress.done : 0} / {start.repoCount} repositories
            </span>
          </div>
        )}
        {report && <Verdict report={report} />}
      </Card>

      {atRisk.map((repo) => (
        <RepoCard key={repo.path} repo={repo} />
      ))}

      {report && report.envFiles.length > 0 && (
        <Card title="Env files">
          <ul className="steps">
            {report.envFiles.map((file) => (
              <li key={file.key}>
                <Dot tone="error" /> <code>{file.key}</code> <span className="muted">{file.state}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">Back them up on the Env files page.</p>
        </Card>
      )}

      {report && report.icloudPending > 0 && (
        <Card title="iCloud">
          <p>
            <Dot tone="error" /> {report.icloudPending} file(s) have not uploaded yet. A file in the iCloud folder is
            not a backup until it has.
          </p>
        </Card>
      )}
    </>
  )
}

function Verdict({report}: {report: DoctorReport}) {
  return report.safe ? (
    <p className="verdict verdict-ok">
      <Dot tone="ok" /> Safe to wipe — {report.repoCount} repositories checked, everything is pushed or backed up.
    </p>
  ) : (
    <p className="verdict verdict-error">
      <Dot tone="error" /> {report.problems} area(s) need attention before wiping.
    </p>
  )
}

function RepoCard({repo}: {repo: RepoAtRisk}) {
  return (
    <Card title={<code>{repo.relativePath}</code>}>
      <ul className="steps">
        {repo.dirty > 0 && (
          <li>
            <Dot tone="error" /> {repo.dirty} uncommitted change(s) <span className="muted">→ commit them</span>
          </li>
        )}
        {repo.stashes > 0 && (
          <li>
            <Dot tone="error" /> {repo.stashes} stash(es){' '}
            <span className="muted">→ git stash show -p &gt; backup.patch</span>
          </li>
        )}
        {repo.branches.map((branch) => (
          <li key={branch.name}>
            <Dot tone={branch.risk === 'local-only' ? 'error' : 'warn'} /> <code>{branch.name}</code>: {branch.unpushed}{' '}
            unpushed{branch.upstreamGone ? ' (upstream deleted)' : ''} <span className="muted">— {branch.reason}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
